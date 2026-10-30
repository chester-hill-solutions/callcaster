import {
  createWorkspaceTwilioInstance,
  requireWorkspaceAccess,
} from "@/lib/database/workspace.server";
import { logger } from "@/lib/logger.server";
import { resolveJsonAuthSession } from "@/lib/api-auth.server";
import { playTwiml } from "@/lib/twilio-twiml.server";
import { loadCampaignVoicedropAudio } from "@/lib/sms-campaign-db.server";
import { findCallSidByParentCallSid } from "@/lib/telephony-db.server";
import { findFundedVoicedropCustomer, findLegacyVoicedropCustomer } from "@/lib/customer-voicedrop.server";
import { createOriginalVoiceAccountClient } from "@/lib/voice-original-account.server";
import { createSignedObjectUrl } from "@/lib/object-storage.server";
import { defineAction } from "@/lib/handler.server";
import type { ActionFunctionArgs } from "react-router";
import type TwilioSDK from "twilio";

type TwilioClient = TwilioSDK.Twilio;

type AudiodropDeps = Partial<{
  verifyAuth: typeof resolveJsonAuthSession;
  createWorkspaceTwilioInstance: (args: {
    workspace_id: string;
  }) => Promise<TwilioClient>;
  findCallSidByParentCallSid: typeof findCallSidByParentCallSid;
  loadCampaignVoicedropAudio: typeof loadCampaignVoicedropAudio;
  createSignedObjectUrl: typeof createSignedObjectUrl;
}>;

function audiodropDependencies(deps?: AudiodropDeps) {
  return {
    verifyAuth: deps?.verifyAuth ?? resolveJsonAuthSession,
    createWorkspaceTwilioInstance:
      deps?.createWorkspaceTwilioInstance ?? createWorkspaceTwilioInstance,
    findCallSidByParentCallSid:
      deps?.findCallSidByParentCallSid ?? findCallSidByParentCallSid,
    loadCampaignVoicedropAudio:
      deps?.loadCampaignVoicedropAudio ?? loadCampaignVoicedropAudio,
    createSignedObjectUrl: deps?.createSignedObjectUrl ?? createSignedObjectUrl,
  };
}

function parseVoicedropTarget(callId: FormDataEntryValue | null, campaignId: FormDataEntryValue | null) {
  const campaign = Number(campaignId);
  if (typeof callId !== "string" || !callId || !Number.isSafeInteger(campaign) || campaign <= 0) return null;
  return { callSid: callId, campaignId: campaign };
}

export const action = defineAction({
  sideEffects: ["db-read", "twilio", "external"],
  handler: async ({
    request,
    deps,
  }: ActionFunctionArgs & { deps?: AudiodropDeps }) => {
  const d = audiodropDependencies(deps);

  const auth = await d.verifyAuth(request);
  const formData = await request.formData();
  const callId = formData.get("callId");
  const workspaceId = formData.get("workspaceId");
  const campaignId = formData.get("campaignId");

  if (typeof workspaceId !== "string" || !workspaceId) return { success: false, error: "workspaceId is required" };
  await requireWorkspaceAccess({ user: auth.user, workspaceId });

  try {
    const target = parseVoicedropTarget(callId, campaignId);
    if (!target) return { success: false, error: "Call and campaign are required" };
    const funded = await findFundedVoicedropCustomer(workspaceId, target.callSid, target.campaignId);
    const childCallSid = funded?.callSid ?? await d.findCallSidByParentCallSid(workspaceId, target.callSid)
      ?? await findLegacyVoicedropCustomer(workspaceId, target.callSid, target.campaignId);
    if (!childCallSid) {
      throw { call: new Error("Call not found") };
    }
    const twilio = funded ? await createOriginalVoiceAccountClient(funded.reservation)
      : await d.createWorkspaceTwilioInstance({ workspace_id: workspaceId });

    let voicedropAudio: string | null;
    try {
      voicedropAudio = await d.loadCampaignVoicedropAudio(
        workspaceId as string,
        target.campaignId,
      );
    } catch (error) {
      throw { campaign: error };
    }

    let signedUrl: string | null = null;
    if (voicedropAudio) {
      try {
        signedUrl = await d.createSignedObjectUrl(
          "workspaceAudio",
          `${workspaceId}/${voicedropAudio}`,
          3600,
        );
      } catch (voicemailError) {
        throw { voicemail: voicemailError };
      }
    }

    if (!signedUrl) {
      logger.error("No audio found for voicemail drop");
      await twilio.calls(childCallSid).update({ status: "completed" });
      return { success: false, error: "No audio found" };
    }

    await twilio.calls(childCallSid).update({
      twiml: playTwiml(signedUrl),
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    logger.error("Error in audiodrop:", error);
    return { success: false, error: "Could not send voicemail audio. Check the call and try again." };
  }
  return { success: true };
  },
});
