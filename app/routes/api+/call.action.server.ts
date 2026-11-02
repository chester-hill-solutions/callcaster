import { env } from "@/lib/env.server";
import { appendLiveTranscriptionStreamTwiml } from "@/lib/media-stream-twiml.server";
import { normalizePhoneNumber } from "@/lib/phone";
import { logger } from "@/lib/logger.server";
import { requireTwilioSignature, resolveCanonicalTwilioWebhookUrl, twilioWebhookForbiddenHangup } from "@/lib/twilio-webhook.server";
import { getWorkspaceById } from "@/lib/workspace-members-db.server";
import { defineAction } from "@/lib/handler.server";
import { createVoiceResponse, sayHangupTwiml } from "@/lib/twilio-twiml.server";
import { normalizeVerifiedVoiceParams } from "@/lib/twilio/verified-voice-params";
import { startPreparedHandsetVoiceRecipient } from "@/server/handset-voice-reservation.server";
import { voiceContinuationUrl } from "@/lib/voice-continuation";
import { voiceWebhookDeliveryUrl } from "@/lib/twilio-webhook-delivery";

function unavailable() {
  return new Response(sayHangupTwiml("We could not connect this call. Check your handset session and try again."),
    { headers: { "Content-Type": "text/xml" } });
}

export const action = defineAction({
  auth: async ({ request }) => {
    const formData = await request.clone().formData();
    const params = Object.fromEntries(formData.entries()) as Record<string, string>;
    const forbidden = await requireTwilioSignature(request, { workspaceId: params.workspace_id || undefined,
      callSid: params.CallSid ?? params.call_sid, params });
    if (forbidden) return forbidden;
    if (Array.from(formData.keys()).some((key) => formData.getAll(key).length !== 1) ||
        !normalizeVerifiedVoiceParams(params)) return twilioWebhookForbiddenHangup();
    const workspaceId = params.workspace_id?.trim(), clientIdentity = params.client_identity?.trim();
    const reservationId = params.credit_reservation;
    if (!workspaceId || !clientIdentity || !reservationId || !params.CallSid || !params.AccountSid) return twilioWebhookForbiddenHangup();
    let recipient: string;
    try { recipient = normalizePhoneNumber(params.To ?? ""); }
    catch { return unavailable(); }
    return { workspaceId, clientIdentity, reservationId, recipient, callSid: params.CallSid,
      accountSid: params.AccountSid, from: params.From ?? "", direction: params.Direction ?? "", parentCallSid: params.ParentCallSid };
  },
  sideEffects: ["twilio", "db-read", "db-write"],
  handler: async ({ request, auth }) => {
    try {
      const workspace = await getWorkspaceById(auth.workspaceId);
      const statusUrl = new URL("/api/call-status", env.BASE_URL());
      statusUrl.searchParams.set("credit_reservation", auth.reservationId);
      statusUrl.searchParams.set("credit_leg", "recipient");
      const result = await startPreparedHandsetVoiceRecipient({ ...auth,
        requestUrl: resolveCanonicalTwilioWebhookUrl(request), statusCallback: statusUrl.href,
        continuationUrl: voiceContinuationUrl(env.BASE_URL(), auth.reservationId),
      }, (reservation, recording) => {
        if (!reservation.user_id) throw new Error("Handset reservation has no actor");
        const twiml = createVoiceResponse();
        appendLiveTranscriptionStreamTwiml({ twiml,
          featureFlags: workspace?.feature_flags as Record<string, unknown> | undefined,
          params: { workspaceId: auth.workspaceId, userId: reservation.user_id,
            direction: "outbound", callSid: auth.callSid, streamName: `call-${auth.callSid}` },
        });
        const dial = twiml.dial({ callerId: reservation.caller_id, record: "record-from-answer",
          ...(reservation.setup_continuation_url ? { action: voiceWebhookDeliveryUrl(reservation.setup_continuation_url), method: "POST" } : {}),
          recordingStatusCallback: voiceWebhookDeliveryUrl(recording.callback_url), recordingStatusCallbackMethod: "POST",
          recordingStatusCallbackEvent: ["in-progress", "completed", "absent"] });
        dial.number({ statusCallback: statusUrl.href, statusCallbackEvent: ["initiated", "ringing", "answered", "completed"] }, reservation.recipient);
        return new Response(twiml.toString(), { headers: { "Content-Type": "text/xml" } });
      });
      return result?.instruction ?? unavailable();
    } catch (error) {
      logger.error("handset.voice_instruction_failed", error);
      return unavailable();
    }
  },
});
