import { createWorkspaceTwilioInstance } from "@/lib/database.server";
import { verifyAuth } from "@/lib/supabase.server";

export const action = async ({ request }: { request: Request }) => {
  const formData = await request.formData();
  const callId = formData.get("callId");
  const workspaceId = formData.get("workspaceId");
  const campaignId = formData.get("campaignId");
  const { supabaseClient } = await verifyAuth(request);
  try {
  const twilio = await createWorkspaceTwilioInstance({ supabase: supabaseClient, workspace_id: workspaceId as string });
  const {data: call, error: callFetchError} = await supabaseClient.from("call").select("sid").eq("parent_call_sid", callId as string).single()
  if (callFetchError) throw {'call': callFetchError};
  const {data, error} = await supabaseClient.from("live_campaign").select("voicedrop_audio").eq("campaign_id", Number(campaignId)).single();
  if (error) throw {'campaign': error};

  const { data: audio, error: voicemailError } = data.voicedrop_audio ? await supabaseClient.storage.from(`workspaceAudio`).createSignedUrl(`${workspaceId}/${data.voicedrop_audio}`, 3600) : {data:null, error:null}
 if (!audio) {
  console.error('No audio found');
  twilio.calls(call.sid).update({status: 'completed'})
  return {success: false, error: 'No audio found'};
 };
  if (voicemailError) throw {'voicemail': voicemailError}
  if (!audio.signedUrl) {
    console.error('No signed URL found');
    return {success: false, error: 'No signed URL found'};
  }
  twilio.calls(call.sid).update({
    twiml:`<Response><Play>${audio.signedUrl}</Play></Response>`
  })
  }
  catch (error){
    console.error(error);
    return {success: false, error};
  }
  return {success: true}
};
