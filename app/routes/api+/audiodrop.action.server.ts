import { createWorkspaceTwilioInstance } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { resolveJsonAuthSession } from "@/lib/api-auth.server";
import { playTwiml } from "@/lib/twilio-twiml.server";
import { loadCampaignVoicedropAudio } from "@/lib/sms-campaign-db.server";
import { findCallSidByParentCallSid } from "@/lib/telephony-db.server";
import { createSignedObjectUrl } from "@/lib/object-storage.server";
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

export const action = async ({
  request,
  deps,
}: {
  request: Request;
  deps?: AudiodropDeps;
}) => {
  const d = {
    verifyAuth: deps?.verifyAuth ?? resolveJsonAuthSession,
    createWorkspaceTwilioInstance:
      deps?.createWorkspaceTwilioInstance ?? createWorkspaceTwilioInstance,
    findCallSidByParentCallSid:
      deps?.findCallSidByParentCallSid ?? findCallSidByParentCallSid,
    loadCampaignVoicedropAudio:
      deps?.loadCampaignVoicedropAudio ?? loadCampaignVoicedropAudio,
    createSignedObjectUrl: deps?.createSignedObjectUrl ?? createSignedObjectUrl,
  };

  const formData = await request.formData();
  const callId = formData.get("callId");
  const workspaceId = formData.get("workspaceId");
  const campaignId = formData.get("campaignId");
  await d.verifyAuth(request);

  try {
    const twilio = await d.createWorkspaceTwilioInstance({
      workspace_id: workspaceId as string,
    });
    const childCallSid = await d.findCallSidByParentCallSid(callId as string);
    if (!childCallSid) {
      throw { call: new Error("Call not found") };
    }

    let voicedropAudio: string | null;
    try {
      voicedropAudio = await d.loadCampaignVoicedropAudio(
        workspaceId as string,
        Number(campaignId),
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
      twilio.calls(childCallSid).update({ status: "completed" });
      return { success: false, error: "No audio found" };
    }

    twilio.calls(childCallSid).update({
      twiml: playTwiml(signedUrl),
    });
  } catch (error) {
    logger.error("Error in audiodrop:", error);
    return { success: false, error };
  }
  return { success: true };
};
