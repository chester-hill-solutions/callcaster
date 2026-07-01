import { data as routeData } from "react-router";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { readTwilioWorkspaceCredentials } from "@/lib/twilio-workspace-credentials";
import { Resend } from "resend";
import { sendWebhookNotification } from "@/lib/workspace-settings/WorkspaceSettingUtils.server";
import { validateTwilioWebhookForCallSid } from "@/lib/twilio-webhook.server";
import { findWorkspaceNumberVoicemailContextByPhone } from "@/lib/inbound-call-db.server";
import {
  findCallBySid,
  updateCallRecordingUrlBySid,
} from "@/lib/telephony-db.server";
import { uploadObject, createSignedObjectUrl } from "@/lib/object-storage.server";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {
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

    const validation = await validateTwilioWebhookForCallSid({
      request,
      callSid,
      params,
    });
    if (!validation.ok) {
      return validation.response;
    }

    const callRow = await findCallBySid(callSid);

    if (!callRow) {
      throw new Error("Error fetching call: not found");
    }
    if (!callRow.to) {
      throw new Error("Call destination number not found");
    }

    const number = await findWorkspaceNumberVoicemailContextByPhone(callRow.to);

    if (!number) {
      throw new Error("Error fetching workspace number: not found");
    }
    if (!number.workspace) {
      throw new Error("Workspace not found");
    }

    const vmTwilioCreds = readTwilioWorkspaceCredentials(number.workspace.twilio_data);
    if (!vmTwilioCreds) {
      throw new Error("Workspace twilio data not found");
    }

    const call = await updateCallRecordingUrlBySid(callSid, recordingUrl);

    if (!call) {
      throw new Error("Error updating call: not found");
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
    try {
      await uploadObject(
        "workspaceAudio",
        fileName,
        recording,
        {
          contentType: "audio/mpeg",
          cacheControl: "60",
        },
      );
    } catch (error) {
      throw new Error(`Error uploading to storage: ${error instanceof Error ? error.message : String(error)}`);
    }

    let signedUrl: string;
    try {
      signedUrl = await createSignedObjectUrl("workspaceAudio", fileName, 8640000);
    } catch (error) {
      throw new Error(`Error creating signed URL: ${error instanceof Error ? error.message : String(error)}`);
    }

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

    const voicemailWebhook = number.workspace.webhook.filter((webhook) =>
      webhook.event?.includes("voicemail"),
    );
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
