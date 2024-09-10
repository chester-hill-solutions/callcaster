import { createWorkspaceTwilioInstance } from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

export const action = async ({ request }) => {
  const formData = await request.formData();
  const callId = formData.get("callId");
  const workspaceId = formData.get("workspaceId");
  const campaignId = formData.get("campaignId");
  const { supabaseClient } = await getSupabaseServerClientWithSession(request);
  try {
  const twilio = await createWorkspaceTwilioInstance({ supabase: supabaseClient, workspace_id: workspaceId });
  const {data, error} = await supabaseClient.from("live_campaign").select("voicedrop_audio").eq("campaign_id", campaignId);
  if (error) throw error;
  const { data: audio, error: voicemailError } = data.voicedrop_audio ? await supabaseClient.storage.from(`workspaceAudio`).createSignedUrl(`${workspaceId}/${data.voicedrop_audio}`, 3600) : {data:null, error:null}
  if (voicemailError) throw voicemailError
  twilio.calls(callId).update({
    twiml:`<Response><Play>${audio.signedUrl}</Play></Response>`
  })
  }
  catch (error){
    console.error(error);
    return {success: false, error};
  }
  return {success: true}
};
