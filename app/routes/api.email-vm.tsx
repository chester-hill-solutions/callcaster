import { createClient } from "@supabase/supabase-js";
import MailService from "@sendgrid/mail";
import { json } from "@remix-run/node";
import { createWorkspaceTwilioInstance } from "~/lib/database.server";

export const action = async ({ request, params }) => {
  try {
    const formData = await request.formData();
    const data = Object.fromEntries(formData);
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
    );

    const { data: call, error: callError } = await supabase
      .from("call")
      .update({ recording_url: data.RecordingUrl })
      .eq("sid", data.CallSid)
      .select()
      .single();

    if (callError) throw new Error(`Error updating call: ${callError.message}`);

    const { data: number, error: numberError } = await supabase
      .from("workspace_number")
      .select(`
        inbound_action,
        type,
        workspace (id, twilio_data)
      `)
      .eq("phone_number", call.to)
      .single();

    if (numberError) throw new Error(`Error fetching workspace number: ${numberError.message}`);

    const action = number.inbound_action;
    const now = new Date();
    
    const recordingResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${data.AccountSid}/Recordings/${data.RecordingSid}.mp3`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${number.workspace.twilio_data.sid}:${number.workspace.twilio_data.authToken}`).toString('base64')}`
      }
    });

    if (!recordingResponse.ok) throw new Error(`Failed to fetch recording: ${recordingResponse.statusText}`);

    const recording = await recordingResponse.blob();

    const fileName = `${number.workspace.id}/voicemail-${data.From}-${now.toISOString()}.mp3`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("workspaceAudio")
      .upload(fileName, recording, {
        cacheControl: "60",
        upsert: false,
        contentType: "audio/mpeg",
      });

    if (uploadError) throw new Error(`Error uploading to Supabase: ${uploadError.message}`);

    const { data: signedUrlData, error: signedUrlError } = await supabase
      .storage
      .from('workspaceAudio')
      .createSignedUrl(fileName, 3600);

    if (signedUrlError) throw new Error(`Error creating signed URL: ${signedUrlError.message}`);

    const signedUrl = signedUrlData.signedUrl;

    MailService.setApiKey(process.env.SENDGRID_API_KEY!);
    const msg = {
      to: action,
      from: "info@callcaster.ca",
      subject: `A new voicemail from ${data.From}`,
      text: `A new voicemail has been recorded for you, you can listen at ${signedUrl}`,
      html: `<p>A new voicemail has been recorded for you, you can listen to it at <a href="${signedUrl}">this link</a>.</p>`,
    };

    const result = await MailService.send(msg);
    return json({ success: true, message: "Voicemail processed and email sent" });
  } catch (error) {
    console.error('Error processing voicemail:', error);
    return json({ error: 'Failed to process voicemail' }, { status: 500 });
  }
};