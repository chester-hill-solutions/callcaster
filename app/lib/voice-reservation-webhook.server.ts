import { bindVoiceReservationCallback } from "@/server/voice-reservation-callback.server";
import { VOICE_RESERVATION_QUERY_PARAM } from "@/lib/voice-credit-dispatch.server";
import { resolveCanonicalTwilioWebhookUrl, twilioWebhookForbiddenHangup } from "@/lib/twilio-webhook.server";
import { logger } from "@/lib/logger.server";
import { hasVoiceReservationCallBinding } from "@/server/voice-bridge-reservation.server";
import { normalizeFundedVoiceDuration } from "@/lib/funded-voice-duration.server";
import { requestVoiceReservationRecovery } from "@/server/voice-credit-reservation.server";
import { normalizeVerifiedVoiceParams } from "@/lib/twilio/verified-voice-params";

/** The caller must validate the Twilio signature before reaching this binding. */
export async function bindVerifiedVoiceReservationRequest(
  request: Request,
  params: Record<string, string>,
  entryPoint: "voice" | "status",
) {
  if (!normalizeVerifiedVoiceParams(params)) return twilioWebhookForbiddenHangup();
  const reservationId = new URL(request.url).searchParams.get(VOICE_RESERVATION_QUERY_PARAM);
  if (!reservationId) return await hasVoiceReservationCallBinding(params.CallSid ?? "", params.ParentCallSid) ? twilioWebhookForbiddenHangup() : null;
  try {
    await bindVoiceReservationCallback({
      reservationId, callSid: params.CallSid ?? "", accountSid: params.AccountSid ?? "",
      to: params.To ?? "", from: params.From ?? "", parentCallSid: params.ParentCallSid,
      direction: params.Direction ?? "", requestUrl: resolveCanonicalTwilioWebhookUrl(request), entryPoint,
    });
    if (entryPoint === "status" && !normalizeFundedVoiceDuration(params)) {
      await requestVoiceReservationRecovery(reservationId);
      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    }
    return null;
  } catch {
    logger.warn("voice_credit.callback_binding_rejected", { reservationId, callSid: params.CallSid, entryPoint });
    return twilioWebhookForbiddenHangup();
  }
}
