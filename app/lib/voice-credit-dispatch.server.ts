import {
  deferVoiceReservation, recordVoiceReservationProvider, releaseUnsentVoiceReservation,
  reserveVoiceCredits, startVoiceReservation,
} from "@/server/voice-credit-reservation.server";

export const VOICE_RESERVATION_QUERY_PARAM = "credit_reservation";

/** A timeout or a 5xx response cannot prove that the provider rejected a POST. */
export function isDefiniteVoiceCreateRejection(error: unknown) {
  if (typeof error !== "object" || error === null || !("status" in error)) return false;
  const status = Number(error.status);
  return Number.isInteger(status) && status >= 400 && status < 500 && status !== 408;
}

export async function dispatchReservedVoiceCall<T extends { sid: string }>(
  args: Parameters<typeof reserveVoiceCredits>[0] & {
    statusCallback: string;
    create: (statusCallback: string) => Promise<T>;
  },
) {
  const callback = new URL(args.statusCallback);
  const reserved = await reserveVoiceCredits(args);
  if (!reserved.ok) return reserved;
  const reservation = await startVoiceReservation(reserved.reservation);
  callback.searchParams.set(VOICE_RESERVATION_QUERY_PARAM, reservation.id);
  let created = false;
  try {
    const call = await args.create(callback.toString());
    created = true;
    await recordVoiceReservationProvider(reservation, call.sid);
    return { ok: true as const, call, reservation };
  } catch (error) {
    if (!created && isDefiniteVoiceCreateRejection(error)) {
      await releaseUnsentVoiceReservation(reservation, "rejected");
    } else {
      await deferVoiceReservation(reservation, "Provider creation or call persistence needs recovery");
    }
    throw error;
  }
}
