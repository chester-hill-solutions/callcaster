import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { ActionFunctionArgs, json } from "@remix-run/node";
import { createWorkspaceTwilioInstance } from "@/lib/database.server";
import { Workspace, WorkspaceNumber, WorkspaceWebhook } from "@/lib/types";
import { sendWebhookNotification } from "@/lib/workspace-settings/WorkspaceSettingUtils";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import type { Database } from "@/lib/database.types";

const resend = new Resend(env.RESEND_API_KEY());

const resend = new Resend(process.env.RESEND_API_KEY);

export const action = async ({ request, params }: ActionFunctionArgs) => {
  try {
    const formData = await request.formData();
    const recordingUrl = formData.get("RecordingUrl");
    const callSid = formData.get("CallSid");
    const accountSid = formData.get("AccountSid");
    const recordingSid = formData.get("RecordingSid");
    const recordingDuration = formData.get("RecordingDuration");
    
    if (!recordingUrl || typeof recordingUrl !== 'string') {
      throw new Error('Missing or invalid RecordingUrl');
    }
    if (!callSid || typeof callSid !== 'string') {
      throw new Error('Missing or invalid CallSid');
    }
    
    const supabase = createClient<Database>(
      env.SUPABASE_URL(),
      env.SUPABASE_SERVICE_KEY(),
    );

    const { data: call, error: callError } = await supabase
      .from("call")
      .update({ recording_url: recordingUrl })
      .eq("sid", callSid)
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
      .single<WorkspaceNumber & { workspace: Workspace & { webhook: (WorkspaceWebhook & { events?: Array<{ category: string }> })[] } }>();

    if (numberError) throw new Error(`Error fetching workspace number: ${numberError.message}`);
    if (!number.workspace) throw new Error(`Workspace not found`);
    if (!number.workspace.twilio_data) throw new Error(`Workspace twilio data not found`);
    const action = number.inbound_action;
    const now = new Date();

    if (!accountSid || typeof accountSid !== 'string') {
      throw new Error('Missing or invalid AccountSid');
    }
    if (!recordingSid || typeof recordingSid !== 'string') {
      throw new Error('Missing or invalid RecordingSid');
    }
    
    const recordingResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${recordingSid}.mp3`, {
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
    const result = await resend.emails.send({
      from: "Callcaster <info@callcaster.ca>",
      to: [action?.toString() || ''],
      subject: `New Voicemail from ${call.from}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>New Voicemail Received</h2>
          <p><strong>From:</strong> ${call.from}</p>
          <p><strong>To:</strong> ${call.to}</p>
          <p><strong>Workspace:</strong> ${number.workspace.name}</p>
          <p><strong>Date:</strong> ${now.toLocaleString()}</p>
          <p><a href="${signedUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Listen to Voicemail</a></p>
          <p><a href="${env.BASE_URL()}/workspaces/${number.workspace.id}/voicemails" style="color: #007bff;">View in Workspace</a></p>
        </div>
      `,
      text: `
        New Voicemail Received
        
        From: ${call.from}
        To: ${call.to}
        Workspace: ${number.workspace.name}
        Date: ${now.toLocaleString()}
        
        Listen to voicemail: ${signedUrl}
        View in workspace: ${env.BASE_URL()}/workspaces/${number.workspace.id}/voicemails
      `,
    });

    // Send webhook notification
    const voicemailWebhook = number.workspace.webhook
      .map((webhook) => 
        webhook.events?.filter((event) => event.category === "voicemail") || []
      )
      .flat();
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
          duration: recordingDuration ? String(recordingDuration) : undefined,
          timestamp: now.toISOString(),
        },
        supabaseClient: supabase,
      });
    }

    return json({ success: true, message: "Voicemail processed and email sent", result });
  } catch (error) {
    logger.error('Error processing voicemail:', error);
    return json({ error: 'Failed to process voicemail' }, { status: 500 });
  }
};