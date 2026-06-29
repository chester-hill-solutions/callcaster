import { createWorkspaceTwilioInstance } from "@/lib/database.server";
import type { Database } from "@/lib/database.types";
import { logger } from "@/lib/logger.server";
import { resolveJsonAuthSession } from "@/lib/api-auth.server";
import { playTwiml } from "@/lib/twilio-twiml.server";
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
    const { data: call, error: callFetchError } = await supabaseClient
      .from("call")
      .select("sid")
      .eq("parent_call_sid", callId as string)
      .single();
    if (callFetchError) throw { call: callFetchError };
    const { data, error } = await supabaseClient
      .from("live_campaign")
      .select("voicedrop_audio")
      .eq("campaign_id", Number(campaignId))
      .single();
    if (error) throw { campaign: error };

    const { data: audio, error: voicemailError } = data.voicedrop_audio
      ? await supabaseClient.storage
          .from(`workspaceAudio`)
          .createSignedUrl(`${workspaceId}/${data.voicedrop_audio}`, 3600)
      : { data: null, error: null };
    if (!audio) {
      logger.error("No audio found for voicemail drop");
      twilio.calls(call.sid).update({ status: "completed" });
      return { success: false, error: "No audio found" };
    }
    if (voicemailError) throw { voicemail: voicemailError };
    if (!audio.signedUrl) {
      logger.error("No signed URL found for audio");
      return { success: false, error: "No signed URL found" };
    }
    twilio.calls(call.sid).update({
      twiml: playTwiml(audio.signedUrl),
    });
  } catch (error) {
    logger.error("Error in audiodrop:", error);
    return { success: false, error };
  }
  return { success: true };
};
