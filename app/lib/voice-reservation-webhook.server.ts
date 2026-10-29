import { bindVoiceReservationCallback } from "@/server/voice-reservation-callback.server";
import { VOICE_RESERVATION_QUERY_PARAM } from "@/lib/voice-credit-dispatch.server";
import { resolveCanonicalTwilioWebhookUrl, twilioWebhookForbiddenHangup } from "@/lib/twilio-webhook.server";
import { logger } from "@/lib/logger.server";

/** The caller must validate the Twilio signature before reaching this binding. */
export async function bindVerifiedVoiceReservationRequest(
  request: Request,
  params: Record<string, string>,
  entryPoint: "voice" | "status",
) {
  const reservationId = new URL(request.url).searchParams.get(VOICE_RESERVATION_QUERY_PARAM);
  if (!reservationId) return null;
  try {
    await bindVoiceReservationCallback({
      reservationId, callSid: params.CallSid ?? "", accountSid: params.AccountSid ?? "",
      to: params.To ?? "", parentCallSid: params.ParentCallSid,
      direction: params.Direction ?? "", requestUrl: resolveCanonicalTwilioWebhookUrl(request), entryPoint,
    });
    return null;
  } catch {
    logger.warn("voice_credit.callback_binding_rejected", { reservationId, callSid: params.CallSid, entryPoint });
    return twilioWebhookForbiddenHangup();
  }
}
