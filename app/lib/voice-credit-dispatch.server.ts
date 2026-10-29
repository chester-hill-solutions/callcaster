import {
  deferVoiceReservation, recordVoiceReservationProvider, releaseUnsentVoiceReservation,
  reserveVoiceCredits, startVoiceReservation,
  type VoiceDispatchUrls,
} from "@/server/voice-credit-reservation.server";
import { data as routeData } from "react-router";
import { outboundCreditsResponse } from "@/lib/outbound-credit-gate.server";
import { AppError, ErrorCode } from "@/lib/errors.server";

export const VOICE_RESERVATION_QUERY_PARAM = "credit_reservation";

export function ivrQueueVoiceOperationKey(queueId: number) {
  return `ivr-queue:${queueId}`;
}

export class VoiceDispatchUncertainError extends Error {
  constructor(readonly reservationId: string, cause: unknown) {
    super("Call creation needs provider verification", { cause });
    this.name = "VoiceDispatchUncertainError";
  }
}

export function voiceDispatchBlockedResponse(result: Extract<Awaited<ReturnType<typeof reserveVoiceCredits>>, { ok: false }>) {
  if (result.reason === "queue_not_found") throw new AppError("Queue entry not found", 404, ErrorCode.NOT_FOUND);
  if (result.reason === "queue_not_queued") return routeData({ error: "This contact is no longer queued." }, { status: 409 });
  return result.reason === "dispatch_in_progress" || result.reason === "already_dispatched"
    ? routeData({ error: "This call is awaiting completion or recovery." }, { status: 409 })
    : outboundCreditsResponse(result);
}

/** A timeout or a 5xx response cannot prove that the provider rejected a POST. */
export function isDefiniteVoiceCreateRejection(error: unknown) {
  if (typeof error !== "object" || error === null || !("status" in error)) return false;
  const status = Number(error.status);
  return Number.isInteger(status) && status >= 400 && status < 500 && status !== 408;
}

export async function dispatchReservedVoiceCall(
  args: Parameters<typeof reserveVoiceCredits>[0] & VoiceDispatchUrls & {
    beforeCreate?: () => void | Promise<void>;
    create: (urls: VoiceDispatchUrls) => Promise<{ sid: string }>;
  },
) {
  const callback = new URL(args.statusCallback);
  const voice = new URL(args.voiceUrl);
  const reserved = await reserveVoiceCredits(args);
  if (!reserved.ok) {
    return reserved.reason === "already_dispatched"
      ? { ok: true as const, callSid: reserved.callSid, replayed: true, queueGeneration: reserved.queueGeneration }
      : reserved;
  }
  callback.searchParams.set(VOICE_RESERVATION_QUERY_PARAM, reserved.reservation.id);
  voice.searchParams.set(VOICE_RESERVATION_QUERY_PARAM, reserved.reservation.id);
  const urls = { voiceUrl: voice.toString(), statusCallback: callback.toString() };
  let reservation = reserved.reservation;
  let attempted = false;
  let created = false;
  try {
    reservation = await startVoiceReservation(reservation, urls);
    await args.beforeCreate?.();
    attempted = true;
    const call = await args.create(urls);
    created = true;
    await recordVoiceReservationProvider(reservation, call.sid);
    return { ok: true as const, callSid: call.sid, replayed: false, queueGeneration: reservation.queue_generation };
  } catch (error) {
    if (!attempted) {
      await releaseUnsentVoiceReservation(reservation, "not_sent");
    } else if (!created && isDefiniteVoiceCreateRejection(error)) {
      await releaseUnsentVoiceReservation(reservation, "rejected");
    } else {
      await deferVoiceReservation(reservation, "Provider creation or call persistence needs recovery");
      throw new VoiceDispatchUncertainError(reservation.id, error);
    }
    throw error;
  }
}
