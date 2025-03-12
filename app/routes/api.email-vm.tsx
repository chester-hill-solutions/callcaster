import { createClient } from "@supabase/supabase-js";
import MailService from "@sendgrid/mail";
import { ActionFunctionArgs, json } from "@remix-run/node";
import { createWorkspaceTwilioInstance } from "~/lib/database.server";
import { Workspace, WorkspaceNumber } from "~/lib/types";
import { MailDataRequired } from "@sendgrid/mail";
import { sendWebhookNotification } from "~/lib/WorkspaceSettingUtils/WorkspaceSettingUtils";

export const action = async ({ request, params }: ActionFunctionArgs) => {
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
        workspace (id, twilio_data, name, webhook(*))
      `)
      .eq("phone_number", call.to)
      .single<WorkspaceNumber & { workspace: Workspace }>();

    if (numberError) throw new Error(`Error fetching workspace number: ${numberError.message}`);
    if (!number.workspace) throw new Error(`Workspace not found`);
    if (!number.workspace.twilio_data) throw new Error(`Workspace twilio data not found`);
    const action = number.inbound_action;
    const now = new Date();

    const recordingResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${data.AccountSid}/Recordings/${data.RecordingSid}.mp3`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${number.workspace.twilio_data.sid}:${number.workspace.twilio_data.authToken}`).toString('base64')}`
      }
    });

    if (!recordingResponse.ok) throw new Error(`Failed to fetch recording: ${recordingResponse.statusText}`);

    const recording = await recordingResponse.blob()
    const recordingBase64 = await recording.text()

    const fileName = `${number.workspace.id}/voicemail-${call.from}-${now.toISOString()}.mp3`;
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
      .createSignedUrl(fileName, 8640000, { download: true });

    if (signedUrlError) throw new Error(`Error creating signed URL: ${signedUrlError.message}`);

    const signedUrl = signedUrlData.signedUrl;

    // Send email notification
    MailService.setApiKey(process.env.SENDGRID_API_KEY!);
    const msg: MailDataRequired = {
      templateId: "d-8f12a98fe1af438cae0efdced5eeb512",
      from: {
        email: "info@callcaster.ca",
        name: "Callcaster"
      },
      personalizations: [
        {
          to: [{
            email: action?.toString() || '',
            name: ""
          }],
          dynamicTemplateData: {
            caller_number: call.from,
            to_number: call.to,
            workspace_name: number.workspace.name,
            workspace_link: `${process.env.BASE_URL}/workspaces/${number.workspace.id}/voicemails`,
            voicemail_url: signedUrl,
          },
        },
      ],
    };

    const result = await MailService.send(msg);

    // Send webhook notification
    const voicemailWebhook = number.workspace.webhook.map((webhook: any) => webhook.events.filter((event: any) => event.category === "voicemail")).flat()
    if (voicemailWebhook.length > 0) {
      await sendWebhookNotification({
        eventCategory: "voicemail",
        eventType: "INSERT",
        workspaceId: number.workspace.id,
        payload: {
          call_sid: call.sid,
          from: call.from,
          to: call.to,
          recording_url: signedUrl,
          duration: data.RecordingDuration,
          timestamp: now.toISOString(),
        },
        supabaseClient: supabase,
      });
    }

    return json({ success: true, message: "Voicemail processed and email sent", result });
  } catch (error) {
    console.error('Error processing voicemail:', error);
    return json({ error: 'Failed to process voicemail' }, { status: 500 });
  }
};