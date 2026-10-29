import { reserveVoiceCredits, deferVoiceReservation, releaseUnsentVoiceReservation, type VoiceReservationInput } from "@/server/voice-credit-reservation.server";
import { startVoiceBridgeReservation, recordVoiceBridgeSetupProvider, knownVoiceSetupSid, type VoiceBridgeUrls } from "@/server/voice-bridge-reservation.server";
import { isDefiniteVoiceCreateRejection, VoiceDispatchUncertainError, VOICE_RESERVATION_QUERY_PARAM } from "@/lib/voice-credit-dispatch.server";

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
  };
  let attempted = false, accepted = false;
  try {
    reservation = await startVoiceBridgeReservation(reservation, urls);
    attempted = true;
    const root = await args.create(urls);
    accepted = true;
    await recordVoiceBridgeSetupProvider(reservation, root.sid);
    return { ok: true as const, callSid: root.sid, replayed: false };
  } catch (error) {
    const knownSid = attempted ? await knownVoiceSetupSid(reservation) : null;
    if (knownSid) return { ok: true as const, callSid: knownSid, replayed: true };
    if (!attempted) await releaseUnsentVoiceReservation(reservation, "not_sent");
    else if (!accepted && isDefiniteVoiceCreateRejection(error)) await releaseUnsentVoiceReservation(reservation, "rejected");
    else {
      await deferVoiceReservation(reservation, "Manual setup creation or persistence needs recovery");
      throw new VoiceDispatchUncertainError(reservation.id, error);
    }
    throw error;
  }
}
