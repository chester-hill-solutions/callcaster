import {
  deferVoiceReservation, recordVoiceReservationProvider, releaseUnsentVoiceReservation,
  reserveVoiceCredits, startVoiceReservation, knownVoiceReservationProviderSid,
  type VoiceDispatchUrls, type VoiceReservation,
} from "@/server/voice-credit-reservation.server";
import { data as routeData } from "react-router";
import { outboundCreditsResponse } from "@/lib/outbound-credit-gate.server";
import { logger } from "@/lib/logger.server";
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
  if (result.reason === "audio_source_unavailable") return routeData({ error: "Phone audio is not ready. Check the connection before starting a call." }, { status: 409 });
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
  try {
    reservation = await startVoiceReservation(reservation, urls, args.audioSource?.proof);
    await args.beforeCreate?.();
  } catch (error) {
    await releaseUnsentVoiceReservation(reservation, "not_sent");
    throw error;
  }
  return dispatchStartedVoiceCall(reservation, () => args.create(urls));
}

/** The owner has committed its send checkpoint; never retry the provider POST. */
export async function dispatchStartedVoiceCall<T extends { sid: string }>(
  reservation: VoiceReservation, create: () => Promise<T>,
) {
  if (reservation.state !== "creating" || !reservation.send_started_at || !reservation.voice_url || !reservation.status_callback ||
      reservation.lease_expires_at.getTime() <= Date.now()) {
    throw new VoiceDispatchUncertainError(reservation.id, new Error("Voice send checkpoint is not owned"));
  }
  let created = false;
  try {
    const call = await create();
    created = true;
    await recordVoiceReservationProvider(reservation, call.sid);
    return { ok: true as const, callSid: call.sid, call, replayed: false, queueGeneration: reservation.queue_generation };
  } catch (error) {
    let knownSid: string | null = null;
    try { knownSid = await knownVoiceReservationProviderSid(reservation); }
    catch (receiptError) { logger.error("voice_credit.receipt_read_failed", receiptError); }
    if (knownSid) return { ok: true as const, callSid: knownSid, call: undefined, replayed: true, queueGeneration: reservation.queue_generation };
    if (!created && isDefiniteVoiceCreateRejection(error)) {
      await releaseUnsentVoiceReservation(reservation, "rejected");
      throw error;
    }
    try { await deferVoiceReservation(reservation, "Provider creation or call persistence needs recovery"); }
    catch (deferError) { logger.error("voice_credit.uncertainty_record_failed", deferError); }
    throw new VoiceDispatchUncertainError(reservation.id, error);
  }
}
