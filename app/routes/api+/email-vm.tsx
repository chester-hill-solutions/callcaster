import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { data as routeData, type ActionFunctionArgs } from "react-router";

import { Workspace, WorkspaceNumber, WorkspaceWebhook } from "@/lib/types";
import type { Database } from "@/lib/database.types";
import { readTwilioWorkspaceCredentials } from "@/lib/twilio-workspace-credentials";
import { validateWorkspaceTwilioWebhook } from "@/lib/twilio-webhook.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { logger } = await import("@/lib/logger.server");
  const { env } = await import("@/lib/env.server");
  const { sendWebhookNotification } = await import(
    "@/lib/workspace-settings/WorkspaceSettingUtils.server"
  );
  const resend = new Resend(env.RESEND_API_KEY());

  try {
    const formData = await request.formData();
    const params = Object.fromEntries(formData.entries()) as Record<string, string>;
    const recordingUrl = params.RecordingUrl;
    const callSid = params.CallSid;
    const accountSid = params.AccountSid;
    const recordingSid = params.RecordingSid;
    const recordingDuration = params.RecordingDuration;

    if (!recordingUrl || typeof recordingUrl !== "string") {
      throw new Error("Missing or invalid RecordingUrl");
    }
    if (!callSid || typeof callSid !== "string") {
      throw new Error("Missing or invalid CallSid");
    }

    const supabase = createClient<Database>(
      env.SUPABASE_URL(),
      env.SUPABASE_SERVICE_KEY(),
    );

    const { data: callRow, error: callLookupError } = await supabase
      .from("call")
      .select("sid, from, to, workspace")
      .eq("sid", callSid)
      .single();

    if (callLookupError || !callRow) {
      throw new Error(`Error fetching call: ${callLookupError?.message ?? "not found"}`);
    }
    if (!callRow.to) {
      throw new Error("Call destination number not found");
    }

    const { data: number, error: numberError } = await supabase
      .from("workspace_number")
      .select(
        `
        inbound_action,
        type,
        workspace (id, twilio_data, name, webhook(*))
      `,
      )
      .eq("phone_number", callRow.to)
      .single<
        WorkspaceNumber & {
          workspace: Workspace & {
            webhook: (WorkspaceWebhook & { events?: Array<{ category: string }> })[];
          };
        }
      >();

    if (numberError) {
      throw new Error(`Error fetching workspace number: ${numberError.message}`);
    }
    if (!number.workspace) {
      throw new Error("Workspace not found");
    }

    const validation = validateWorkspaceTwilioWebhook({
      request,
      params,
      twilioData: number.workspace.twilio_data,
    });
    if (!validation.ok) {
      return validation.response;
    }

    const vmTwilioCreds = readTwilioWorkspaceCredentials(number.workspace.twilio_data);
    if (!vmTwilioCreds) {
      throw new Error("Workspace twilio data not found");
    }

    const { data: call, error: callError } = await supabase
      .from("call")
      .update({ recording_url: recordingUrl })
      .eq("sid", callSid)
      .select()
      .single();

    if (callError) {
      throw new Error(`Error updating call: ${callError.message}`);
    }

    const action = number.inbound_action;
    const now = new Date();

    if (!accountSid || typeof accountSid !== "string") {
      throw new Error("Missing or invalid AccountSid");
    }
    if (!recordingSid || typeof recordingSid !== "string") {
      throw new Error("Missing or invalid RecordingSid");
    }

    const recordingResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${recordingSid}.mp3`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${vmTwilioCreds.sid}:${vmTwilioCreds.authToken}`).toString("base64")}`,
        },
      },
    );

    if (!recordingResponse.ok) {
      throw new Error(`Failed to fetch recording: ${recordingResponse.statusText}`);
    }

    const recording = await recordingResponse.blob();

    const fileName = `${number.workspace.id}/voicemail-${call.from}-${now.toISOString()}.mp3`;
    const { error: uploadError } = await supabase.storage
      .from("workspaceAudio")
      .upload(fileName, recording, {
        cacheControl: "60",
        upsert: false,
        contentType: "audio/mpeg",
      });

    if (uploadError) {
      throw new Error(`Error uploading to Supabase: ${uploadError.message}`);
    }

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("workspaceAudio")
      .createSignedUrl(fileName, 8640000, { download: true });

    if (signedUrlError) {
      throw new Error(`Error creating signed URL: ${signedUrlError.message}`);
    }

    const signedUrl = signedUrlData.signedUrl;

    const result = await resend.emails.send({
      from: "Callcaster <info@callcaster.ca>",
      to: [action?.toString() || ""],
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

    const voicemailWebhook = number.workspace.webhook
      .map((webhook) =>
        webhook.events?.filter((event) => event.category === "voicemail") || [],
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

    return routeData({
      success: true,
      message: "Voicemail processed and email sent",
      result,
    });
  } catch (error) {
    logger.error("Error processing voicemail:", error);
    return routeData({ error: "Failed to process voicemail" }, { status: 500 });
  }
};
