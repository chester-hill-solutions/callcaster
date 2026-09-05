import { data as routeData } from "react-router";
import { isInboundMessageDirection } from "@/lib/chat-conversation-sort";
import { logger } from "@/lib/logger.server";
import { requireTwilioSignature } from "@/lib/twilio-webhook.server";
import {
  normalizeSmsStatus,
  pickRawTwilioSmsStatus,
} from "@/lib/sms-status";
import type { TwilioSmsStatusWebhook } from "@/lib/twilio.types";
import {
  findMessageBySid,
  findPendingMessageIntentByNumbers,
  resolveMessageByClientRef,
  updateMessageBySid,
} from "@/lib/message-db.server";
import { defineAction } from "@/lib/handler.server";
import { enqueueRegisteredJob } from "@/lib/worker/job-params.server";
import { SMS_STATUS_SIDE_EFFECTS_JOB_TYPE } from "@/lib/worker/job-types.server";
import type { ActionFunctionArgs } from "react-router";

type SmsStatusAuth =
  | { preflight: "failed" }
  | { preflight: "invalid" }
  | { preflight: "ok"; previewPayload: Partial<TwilioSmsStatusWebhook> };

function smsStatusSideEffectsIdempotencyKey(
  messageSid: string,
  status: string,
): string {
  return `sms_status_side_effects:${messageSid}:${status.toLowerCase()}`;
}

/**
 * Canonical Twilio outbound SMS status webhook (`POST /api/sms/status`).
 * Merged from Edge `sms-status`; new sends use `${BASE_URL}/api/sms/status`.
 *
 * Fast-ack cutover: persists message status, then enqueues billing / outreach
 * disposition / webhook delivery as a worker job. The JSON response always
 * includes `outreach: null` — Twilio ignores the body, and no in-app consumer
 * reads synchronous outreach from this webhook. Disposition updates run in
 * `runSmsStatusSideEffects` on the worker.
 */
export const action = defineAction({
  auth: async ({ request }: ActionFunctionArgs): Promise<SmsStatusAuth | Response> => {
    try {
      const previewFormData = await request.clone().formData();
      const previewPayload = Object.fromEntries(
        previewFormData.entries(),
      ) as Partial<TwilioSmsStatusWebhook>;
      const previewSid = previewPayload.SmsSid;
      const previewStatus = pickRawTwilioSmsStatus(previewPayload);

      if (!previewSid || !previewStatus) {
        return { preflight: "invalid" };
      }

      const forbidden = await requireTwilioSignature(request, {
        messageSid: previewSid,
      });
      if (forbidden) return forbidden;

      return { preflight: "ok", previewPayload };
    } catch (error) {
      logger.error("Unexpected error:", error);
      return { preflight: "failed" };
    }
  },
  // Enqueues the worker billing job that debits per-segment SMS credits.
  sideEffects: ["db-write", "credit"],
  handler: async ({ auth }) => {
    if (auth.preflight === "failed") {
      return routeData({ error: "An unexpected error occurred" }, { status: 500 });
    }
    if (auth.preflight === "invalid") {
      return routeData(
        { error: "Missing required fields: SmsSid and SmsStatus or MessageStatus" },
        { status: 400 },
      );
    }
    try {
      const payload = auth.previewPayload;
      const sid = payload.SmsSid;
      const rawStatus = pickRawTwilioSmsStatus(payload);

      if (!sid || !rawStatus) {
        return routeData(
          { error: "Missing required fields: SmsSid and SmsStatus or MessageStatus" },
          { status: 400 },
        );
      }

      let preUpdateMessage = await findMessageBySid(sid);

      // An unknown SID can be an intent row whose post-send resolve failed
      // (#1582): the placeholder still carries from/to, so attach the SID here
      // and let the normal path bill it.
      if (!preUpdateMessage && payload.From && payload.To) {
        const intent = await findPendingMessageIntentByNumbers({
          from: payload.From,
          to: payload.To,
        });
        if (intent?.client_ref) {
          preUpdateMessage = await resolveMessageByClientRef(intent.workspace, intent.client_ref, { sid });
          logger.warn("sms_status.resolved_pending_intent", {
            sid,
            clientRef: intent.client_ref,
            workspaceId: intent.workspace,
          });
        }
      }

      if (!preUpdateMessage?.workspace) {
        throw new Error("Failed to find message workspace for SMS status webhook");
      }

      if (isInboundMessageDirection(preUpdateMessage.direction)) {
        return routeData({ message: preUpdateMessage, outreach: null });
      }

      const messageStatus = normalizeSmsStatus(rawStatus) ?? "failed";
      if (!normalizeSmsStatus(rawStatus)) {
        logger.warn("Unknown SMS status from Twilio webhook", { sid, status: rawStatus });
      }

      const accountSidFromWebhook =
        typeof payload.AccountSid === "string" && payload.AccountSid.trim()
          ? payload.AccountSid.trim()
          : null;

      const errorCode =
        typeof payload.ErrorCode === "string" && payload.ErrorCode.trim()
          ? Number.parseInt(payload.ErrorCode, 10)
          : null;

      const messageData = await updateMessageBySid(preUpdateMessage.workspace, sid, {
        status: messageStatus,
        ...(accountSidFromWebhook ? { account_sid: accountSidFromWebhook } : {}),
        ...(errorCode != null && Number.isFinite(errorCode) ? { error_code: errorCode } : {}),
      });

      if (!messageData) {
        logger.error("Error updating message for sid", { sid });
        return routeData({ error: "Failed to update message" }, { status: 500 });
      }

      // Narrow the webhook body to a plain string map at the boundary: the
      // typed `payload: Partial<TwilioSmsStatusWebhook>` shape (used above
      // for field access) has no index signature, so it isn't assignable to
      // the job's `twilioParams: Record<string, string>` schema as-is.
      const twilioParams: Record<string, string> = Object.fromEntries(
        Object.entries(payload).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      );

      await enqueueRegisteredJob({
        type: SMS_STATUS_SIDE_EFFECTS_JOB_TYPE,
        workspaceId: messageData.workspace,
        idempotencyKey: smsStatusSideEffectsIdempotencyKey(sid, messageStatus),
        params: {
          sid,
          twilioParams,
        },
      });

      return routeData({ message: messageData, outreach: null });
    } catch (error) {
      logger.error("Unexpected error:", error);
      return routeData({ error: "An unexpected error occurred" }, { status: 500 });
    }
  },
});
