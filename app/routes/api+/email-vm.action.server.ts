import { data as routeData } from "react-router";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { readTwilioWorkspaceCredentials } from "@/lib/twilio-workspace-credentials";
import { Resend } from "resend";
import { sendWebhookNotification } from "@/lib/workspace-settings/WorkspaceSettingUtils.server";
import { requireTwilioSignature } from "@/lib/twilio-webhook.server";
import { findWorkspaceNumberVoicemailContextByPhone } from "@/lib/inbound-call-db.server";
import {
  findCallBySid,
  updateCallRecordingUrlBySid,
} from "@/lib/telephony-db.server";
import { uploadObject, createSignedObjectUrl } from "@/lib/object-storage.server";
import { defineAction } from "@/lib/handler.server";
import { isConservativeEmail } from "../../../shared/inbound-routing-presets";
import type { ActionFunctionArgs } from "react-router";

type EmailVmAuth = { preflight: "ok" } | { preflight: "failed" };

export const action = defineAction({
  auth: async ({ request }: ActionFunctionArgs): Promise<EmailVmAuth | Response> => {
    try {
      const formData = await request.clone().formData();
      const params = Object.fromEntries(formData.entries()) as Record<string, string>;
      const recordingUrl = params.RecordingUrl;
      const callSid = params.CallSid;

      if (!recordingUrl || typeof recordingUrl !== "string") {
        // The handler re-runs this validation and produces the original 500.
        return { preflight: "ok" };
      }
      if (!callSid || typeof callSid !== "string") {
        return { preflight: "ok" };
      }

      const forbidden = await requireTwilioSignature(request, { callSid });
      if (forbidden) return forbidden;

      return { preflight: "ok" };
    } catch (error) {
      logger.error("Error processing voicemail:", error);
      return { preflight: "failed" };
    }
  },
  sideEffects: ["db-write", "twilio", "email", "external"],
  handler: async ({ request, auth }) => {
    if (auth.preflight === "failed") {
      return routeData({ error: "Failed to process voicemail" }, { status: 500 });
    }

    const resend = new Resend(env.RESEND_API_KEY());

    try {
      const formData = await request.clone().formData();
      const params = Object.fromEntries(formData.entries()) as Record<string, string>;
      const recordingUrl = params.RecordingUrl;
      const callSid = params.CallSid;
      const accountSid = params.AccountSid;
      const recordingSid = params.RecordingSid;
      const recordingDuration = params.RecordingDuration;

      // Malformed payloads and unattributable callbacks must NOT 500: Twilio
      // retries 5xx, so a permanent condition (bad body, unknown CallSid)
      // would retry forever. 4xx/2xx both stop the retry cycle. Same
      // precedent as the Trust Hub status callback.
      if (!recordingUrl || typeof recordingUrl !== "string") {
        logger.warn("email-vm: missing RecordingUrl", { callSid: callSid ?? null });
        return routeData({ error: "Missing or invalid RecordingUrl" }, { status: 400 });
      }
      if (!callSid || typeof callSid !== "string") {
        logger.warn("email-vm: missing CallSid");
        return routeData({ error: "Missing or invalid CallSid" }, { status: 400 });
      }

      const callRow = await findCallBySid(callSid);

      if (!callRow) {
        logger.warn("email-vm: no call row for CallSid; acking to stop retries", {
          callSid,
        });
        return routeData({ success: true, resolved: false });
      }
      if (!callRow.to) {
        throw new Error("Call destination number not found");
      }

      // Idempotency guard: Twilio retries the recordingStatusCallback on
      // timeout, and the retry carries the exact same RecordingUrl/RecordingSid
      // as the original. recording_url is persisted only AFTER the email is
      // sent (below), so its presence means the voicemail was fully
      // processed — ack success without sending a duplicate email. A run
      // that failed mid-flight left it unset, so the retry reprocesses.
      if (callRow.recording_url && callRow.recording_url === recordingUrl) {
        logger.debug("Voicemail webhook retry detected; skipping duplicate processing", {
          callSid,
          recordingSid,
        });
        return routeData({ success: true, message: "Already processed" });
      }

      const number = await findWorkspaceNumberVoicemailContextByPhone(callRow.to);

      if (!number) {
        throw new Error("Error fetching workspace number: not found");
      }
      if (!number.workspace) {
        throw new Error("Workspace not found");
      }

      // The workspace number's `inbound_action` doubles as the voicemail email
      // recipient when the inbound flow ends in voicemail capture. When it is
      // unset (or a phone number / URL, not an email — the field also carries
      // forward-to targets and inbound-flow routing), Resend previously got
      // `to: [""]` and either silently rejected the message (result.error) or
      // took an unverified sender path — Twilio then retried indefinitely.
      // Mark the callback processed with a distinct reason so support can see
      // why no email arrived without a burning retry loop.
      const recipient =
        typeof number.inbound_action === "string" ? number.inbound_action.trim() : "";
      if (!recipient || !isConservativeEmail(recipient)) {
        logger.warn("email-vm: workspace number has no email recipient configured", {
          callSid,
          workspaceId: number.workspace.id,
          inbound_action_present: Boolean(recipient),
        });
        // Persist the recording URL so the retry guard swallows Twilio's
        // subsequent retries as "Already processed" instead of hammering.
        const updated = await updateCallRecordingUrlBySid(callSid, recordingUrl);
        if (!updated) {
          logger.warn(
            "email-vm: no email recipient AND failed to persist recording_url",
            { callSid },
          );
        }
        return routeData({
          success: true,
          resolved: false,
          reason: "no_email_recipient",
        });
      }

      const vmTwilioCreds = readTwilioWorkspaceCredentials(number.workspace.twilio_data);
      if (!vmTwilioCreds) {
        throw new Error("Workspace twilio data not found");
      }

      const call = callRow;
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

      // SigV4 presigned URLs are capped at 7 days — the signer itself
      // rejects anything longer, which is what silently killed every
      // voicemail email after the S3 migration (#1224). The email also
      // links to the voicemails page, which mints fresh URLs on demand.
      const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;
      let signedUrl: string;
      try {
        signedUrl = await createSignedObjectUrl(
          "workspaceAudio",
          fileName,
          SIGNED_URL_TTL_SECONDS,
        );
      } catch (error) {
        throw new Error(`Error creating signed URL: ${error instanceof Error ? error.message : String(error)}`);
      }

      const result = await resend.emails.send({
        from: "Callcaster <info@callcaster.ca>",
        to: [recipient],
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

      // resend returns { data, error } and never throws on API errors — an
      // unverified from-domain or bad recipient was previously reported as
      // "email sent". Throwing keeps the callback retryable.
      if (result.error) {
        throw new Error(`Email send failed: ${result.error.message}`);
      }

      // Mark fully processed only now: persisting recording_url earlier made
      // the retry guard above swallow every retry after a mid-flight failure
      // as "Already processed" while no email had ever gone out.
      const updatedCall = await updateCallRecordingUrlBySid(callSid, recordingUrl);
      if (!updatedCall) {
        throw new Error("Error updating call: not found");
      }

      const voicemailWebhook = number.workspace.webhook.filter((webhook) =>
        Array.isArray(webhook.events) && (webhook.events as string[]).includes("voicemail"),
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
  },
});
