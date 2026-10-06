import { data as routeData } from "react-router";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { VoicemailEmailProvider } from "@/lib/voicemail-email-provider.server";
import { sendWebhookNotification } from "@/lib/workspace-settings/WorkspaceSettingUtils.server";
import { requireTwilioSignature } from "@/lib/twilio-webhook.server";
import { findWorkspaceNumberVoicemailContextByPhone } from "@/lib/inbound-call-db.server";
import {
  findCallBySid,
  updateCallRecordingUrlBySid,
} from "@/lib/telephony-db.server";
import { prepareVoicemailEmail } from "@/lib/inbound-voicemail-email.server";
import {
  getInboundVoicemailRecipient, findVoicemailDelivery, prepareVoicemailDelivery,
  claimVoicemailDelivery, completeVoicemailDelivery, releaseVoicemailDelivery,
} from "@/server/inbound-voicemail-store.server";
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

    const resend = new VoicemailEmailProvider(env.RESEND_API_KEY());

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

      const number = await findWorkspaceNumberVoicemailContextByPhone(callRow.to);

      if (!number) {
        throw new Error("Error fetching workspace number: not found");
      }
      if (!number.workspace) {
        throw new Error("Workspace not found");
      }
      if (!callRow.workspace || callRow.workspace !== number.workspace.id) {
        return routeData({ error: "Voicemail call binding does not match" }, { status: 403 });
      }
      const boundRecipient = await getInboundVoicemailRecipient({ workspaceId: number.workspace.id, callSid, phoneNumber: callRow.to });
      if (!accountSid || !recordingSid) throw new Error("Missing recording identity");
      if (callRow.account_sid && callRow.account_sid !== accountSid) {
        return routeData({ error: "Voicemail account binding does not match" }, { status: 403 });
      }
      const binding = { workspaceId: number.workspace.id, callSid, phoneNumber: callRow.to, recordingSid, recordingUrl };
      let delivery = await findVoicemailDelivery(binding);
      // Legacy callbacks predate delivery receipts. A bound IVR recording must
      // not be swallowed by an earlier general recording callback's URL write.
      if (!boundRecipient && !delivery && callRow.recording_url === recordingUrl) {
        return routeData({ success: true, message: "Already processed" });
      }

      // The workspace number's `inbound_action` doubles as the voicemail email
      // recipient when the inbound flow ends in voicemail capture. When it is
      // unset (or a phone number / URL, not an email — the field also carries
      // forward-to targets and inbound-flow routing), Resend previously got
      // `to: [""]` and either silently rejected the message (result.error) or
      // took an unverified sender path — Twilio then retried indefinitely.
      // Mark the callback processed with a distinct reason so support can see
      // why no email arrived without a burning retry loop.
      const recipient = delivery?.recipient ?? boundRecipient ?? (typeof number.inbound_action === "string" ? number.inbound_action.trim() : "");
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

      if (!delivery) {
        const prepared = await prepareVoicemailEmail({ number, call: callRow, recipient, accountSid, recordingSid });
        delivery = await prepareVoicemailDelivery(binding, { recipient, ...prepared });
      }
      const claim = await claimVoicemailDelivery(binding, delivery.id);
      if (claim.kind === "sent" && callRow.recording_url === recordingUrl) {
        return routeData({ success: true, message: "Already processed" });
      }
      if (claim.kind === "busy" || claim.kind === "uncertain") return routeData({ error: claim.kind === "busy" ? "Voicemail delivery is already in progress" : "Voicemail delivery needs reconciliation" }, { status: 503 });
      let result;
      if (claim.kind === "claimed") {
        try {
          result = await resend.emails.send(claim.delivery.email_payload, { idempotencyKey: `voicemail/${claim.delivery.id}` });
          if (result.error) throw new Error(`Email send failed: ${result.error.message}`);
          if (typeof result.data?.id !== "string" || !result.data.id.trim()) throw new Error("Email provider returned no delivery receipt");
          await completeVoicemailDelivery(binding, delivery.id, claim.leaseToken, result.data.id);
        } catch (error) {
          await releaseVoicemailDelivery(binding, delivery.id, claim.leaseToken, error);
          throw error;
        }
      }
      const signedUrl = claim.delivery.signed_url;
      const call = callRow;
      const now = claim.delivery.created_at;

      // Mark fully processed only now: persisting recording_url earlier made
      // the retry guard above swallow every retry after a mid-flight failure
      // as "Already processed" while no email had ever gone out.
      const updatedCall = await updateCallRecordingUrlBySid(callSid, recordingUrl);
      if (!updatedCall) {
        throw new Error("Error updating call: not found");
      }

      await sendWebhookNotification({
        optional: true,
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
