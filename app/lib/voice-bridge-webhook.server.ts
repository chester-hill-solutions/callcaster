import { bindVoiceBridgeSetupCallback, hasVoiceReservationCallBinding, type VoiceBridgeSetupCallback } from "@/server/voice-bridge-reservation.server";
import { bindVoiceReservationCallback } from "@/server/voice-reservation-callback.server";
import { VOICE_RESERVATION_QUERY_PARAM } from "@/lib/voice-credit-dispatch.server";
import { VOICE_LEG_QUERY_PARAM } from "@/lib/manual-voice-dispatch.server";
import { resolveCanonicalTwilioWebhookUrl, twilioWebhookForbiddenHangup } from "@/lib/twilio-webhook.server";
import { logger } from "@/lib/logger.server";
import { normalizeFundedVoiceDuration } from "@/lib/funded-voice-duration.server";
import { requestVoiceReservationRecovery } from "@/server/voice-credit-reservation.server";
import { normalizeVerifiedVoiceParams } from "@/lib/twilio/verified-voice-params";

export function voiceBridgeCallbackArgs(request: Request, params: Record<string, string>, entryPoint: "voice" | "status"): VoiceBridgeSetupCallback {
  return { reservationId: new URL(request.url).searchParams.get(VOICE_RESERVATION_QUERY_PARAM) ?? "",
    accountSid: params.AccountSid ?? "", callSid: params.CallSid ?? "", to: params.To ?? "", from: params.From ?? "",
    direction: params.Direction ?? "", parentCallSid: params.ParentCallSid, requestUrl: resolveCanonicalTwilioWebhookUrl(request),
    entryPoint, status: params.CallStatus };
}

/** Call only after validating the provider signature over the complete URL. */
export async function bindVerifiedVoiceSetupRequest(request: Request, params: Record<string, string>) {
  if (!normalizeVerifiedVoiceParams(params)) return twilioWebhookForbiddenHangup();
  if (new URL(request.url).searchParams.get(VOICE_LEG_QUERY_PARAM) !== "setup") return twilioWebhookForbiddenHangup();
  try { return (await bindVoiceBridgeSetupCallback(voiceBridgeCallbackArgs(request, params, "voice"))).reservation; }
  catch {
    logger.warn("voice_credit.setup_binding_rejected", { callSid: params.CallSid });
    return twilioWebhookForbiddenHangup();
  }
}

/** A setup status is persisted atomically and must not run recipient effects. */
export async function bindVerifiedFundedCallStatus(request: Request, params: Record<string, string>) {
  if (!normalizeVerifiedVoiceParams(params)) return twilioWebhookForbiddenHangup();
  const query = new URL(request.url).searchParams;
  if (!query.get(VOICE_RESERVATION_QUERY_PARAM)) {
    return await hasVoiceReservationCallBinding(params.CallSid ?? "", params.ParentCallSid) ? twilioWebhookForbiddenHangup() : null;
  }
  try {
    const args = voiceBridgeCallbackArgs(request, params, "status");
    const leg = query.get(VOICE_LEG_QUERY_PARAM);
    if (leg === "setup") {
      const { reservation, root } = await bindVoiceBridgeSetupCallback(args);
      return { setup: true as const, workspaceId: reservation.workspace, campaignId: root.campaign_id };
    }
    if (leg !== null && leg !== "recipient") throw new Error("Invalid funded voice leg");
    const saved = await bindVoiceReservationCallback(args);
    if (!saved.workspace) throw new Error("Funded voice call has no workspace");
    const pending = !normalizeFundedVoiceDuration(params);
    if (pending) await requestVoiceReservationRecovery(args.reservationId);
    return { setup: false as const, workspaceId: saved.workspace, pending };
  } catch {
    logger.warn("voice_credit.status_binding_rejected", { callSid: params.CallSid });
    return twilioWebhookForbiddenHangup();
  }
}
