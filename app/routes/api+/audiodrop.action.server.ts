import { createWorkspaceTwilioInstance } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { resolveJsonAuthSession } from "@/lib/api-auth.server";
import { playTwiml } from "@/lib/twilio-twiml.server";
import { loadCampaignVoicedropAudio } from "@/lib/sms-campaign-db.server";
import { findCallSidByParentCallSid } from "@/lib/telephony-db.server";
import type { Database } from "@/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type TwilioSDK from "twilio";

type Supabase = SupabaseClient<Database>;
type TwilioClient = TwilioSDK.Twilio;

type AudiodropDeps = Partial<{
  verifyAuth: (request: Request) => Promise<{ supabaseClient: Supabase }>;
  createWorkspaceTwilioInstance: (args: {
    supabase: Supabase;
    workspace_id: string;
  }) => Promise<TwilioClient>;
  findCallSidByParentCallSid: typeof findCallSidByParentCallSid;
  loadCampaignVoicedropAudio: typeof loadCampaignVoicedropAudio;
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
  };

  const formData = await request.formData();
  const callId = formData.get("callId");
  const workspaceId = formData.get("workspaceId");
  const campaignId = formData.get("campaignId");
  const { supabaseClient } = await d.verifyAuth(request);
  try {
    const twilio = await d.createWorkspaceTwilioInstance({
      supabase: supabaseClient,
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

    const { data: audio, error: voicemailError } = voicedropAudio
      ? await supabaseClient.storage
          .from(`workspaceAudio`)
          .createSignedUrl(`${workspaceId}/${voicedropAudio}`, 3600)
      : { data: null, error: null };
    if (!audio) {
      logger.error("No audio found for voicemail drop");
      twilio.calls(childCallSid).update({ status: "completed" });
      return { success: false, error: "No audio found" };
    }
    if (voicemailError) throw { voicemail: voicemailError };
    if (!audio.signedUrl) {
      logger.error("No signed URL found for audio");
      return { success: false, error: "No signed URL found" };
    }
    twilio.calls(childCallSid).update({
      twiml: playTwiml(audio.signedUrl),
    });
  } catch (error) {
    logger.error("Error in audiodrop:", error);
    return { success: false, error };
  }
  return { success: true };
};
