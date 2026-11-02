import { reserveVoiceCredits, deferVoiceReservation, releaseUnsentVoiceReservation, type VoiceReservationInput, type VoiceReservation } from "@/server/voice-credit-reservation.server";
import { startVoiceBridgeReservation, recordVoiceBridgeSetupProvider, knownVoiceSetupSid, type VoiceBridgeUrls } from "@/server/voice-bridge-reservation.server";
import { isDefiniteVoiceCreateRejection, VoiceDispatchUncertainError, VOICE_RESERVATION_QUERY_PARAM } from "@/lib/voice-credit-dispatch.server";
import { logger } from "@/lib/logger.server";
import { voiceContinuationUrl } from "@/lib/voice-continuation";

export const VOICE_LEG_QUERY_PARAM = "credit_leg";

export function voiceBridgeUrl(value: string, reservationId: string, leg: "setup" | "recipient") {
  const url = new URL(value);
  url.searchParams.set(VOICE_RESERVATION_QUERY_PARAM, reservationId);
  url.searchParams.set(VOICE_LEG_QUERY_PARAM, leg);
  return url.toString();
}

export async function dispatchManualVoiceCall(args: VoiceReservationInput & VoiceBridgeUrls & {
  create: (urls: VoiceBridgeUrls) => Promise<{ sid: string }>;
}) {
  const reserved = await reserveVoiceCredits(args);
  if (!reserved.ok) return reserved.reason === "already_dispatched"
    ? { ok: true as const, callSid: reserved.callSid, replayed: true }
    : reserved;
  let reservation = reserved.reservation;
  const urls = {
    voiceUrl: voiceBridgeUrl(args.voiceUrl, reservation.id, "setup"),
    statusCallback: voiceBridgeUrl(args.statusCallback, reservation.id, "setup"),
    recipientStatusCallback: voiceBridgeUrl(args.recipientStatusCallback, reservation.id, "recipient"),
    continuationUrl: voiceContinuationUrl(args.voiceUrl, reservation.id),
  };
  try {
    reservation = await startVoiceBridgeReservation(reservation, urls);
  } catch (error) {
    await releaseUnsentVoiceReservation(reservation, "not_sent");
    throw error;
  }
  return dispatchStartedVoiceSetup(reservation, () => args.create(urls));
}

/** Setup and recipient share one hold; a setup POST is never retried. */
export async function dispatchStartedVoiceSetup(reservation: VoiceReservation, create: () => Promise<{ sid: string }>) {
  if (reservation.state !== "creating" || !reservation.send_started_at || !reservation.setup_to ||
      !reservation.setup_voice_url || !reservation.setup_status_callback || reservation.lease_expires_at.getTime() <= Date.now()) {
    throw new VoiceDispatchUncertainError(reservation.id, new Error("Voice setup checkpoint is not owned"));
  }
  let accepted = false;
  try {
    const root = await create();
    accepted = true;
    await recordVoiceBridgeSetupProvider(reservation, root.sid);
    return { ok: true as const, callSid: root.sid, replayed: false };
  } catch (error) {
    let knownSid: string | null = null;
    try { knownSid = await knownVoiceSetupSid(reservation); }
    catch (receiptError) { logger.error("voice_credit.setup_receipt_read_failed", receiptError); }
    if (knownSid) return { ok: true as const, callSid: knownSid, replayed: true };
    if (!accepted && isDefiniteVoiceCreateRejection(error)) await releaseUnsentVoiceReservation(reservation, "rejected");
    else {
      try { await deferVoiceReservation(reservation, "Voice setup creation or persistence needs recovery"); }
      catch (deferError) { logger.error("voice_credit.setup_uncertainty_record_failed", deferError); }
      throw new VoiceDispatchUncertainError(reservation.id, error);
    }
    throw error;
  }
}
