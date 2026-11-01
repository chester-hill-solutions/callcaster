import { and, eq } from "drizzle-orm";
import { workspace, workspace_voice_reservation as reservations } from "@/db/schema";
import { matchesVoiceRecipient, type VoiceSetupRoot } from "@/lib/voice-bridge-identity";
import { normalizeProviderStatus } from "@/lib/call-status";
import { terminalVoiceCallDuration } from "@/lib/voice-recovery-duration";
import { parseTwilioVoiceSequence, parseTwilioVoiceTimestamp } from "@/lib/twilio/voice-event-clock";
import { VoiceRecordingBindingError } from "@/lib/voice-recording";
import { db } from "./db";
import type { VoiceReservation } from "./voice-credit-reservation.server";
import { retainVoiceRecordingBoundaryWork } from "./voice-recording-copy.server";

export type VoiceTerminalReceiptSource = "callback" | "recovery";
export type VoiceCustomerCallObservation = VoiceSetupRoot & {
  status: string; duration: string | null; startTime: Date | null; endTime: Date | null;
};

/** The signed Call-progress clock is not the Conference clock or a recovery clock. */
export function voiceCustomerTerminalEventClock(owner: VoiceReservation, params: Record<string, string>,
  source: VoiceTerminalReceiptSource, status: string, duration: string) {
  if (source !== "callback" || owner.terminal_event_at || params.CallbackSource !== "call-progress-events" ||
      params.StatusCallbackEvent || normalizeProviderStatus(params.CallStatus) !== status || params.CallDuration !== duration) return {};
  if (!matchesVoiceRecipient(owner, { sid: params.CallSid ?? "", accountSid: params.AccountSid ?? "",
    to: params.To ?? "", from: params.From ?? "", direction: params.Direction ?? "", parentCallSid: params.ParentCallSid || null })) return {};
  const at = parseTwilioVoiceTimestamp(params.Timestamp);
  return at ? { terminal_event_at: at, terminal_event_sequence: parseTwilioVoiceSequence(params.SequenceNumber) } : {};
}

function sameCustomer(current: VoiceReservation, owner: VoiceReservation) {
  return current.account_sid === owner.account_sid && current.user_id === owner.user_id && current.provider_sid === owner.provider_sid &&
    current.setup_sid === owner.setup_sid && current.conference_id === owner.conference_id &&
    current.recipient === owner.recipient && current.caller_id === owner.caller_id;
}

function callClock(candidate: VoiceCustomerCallObservation) {
  const duration = terminalVoiceCallDuration(candidate.status, candidate.duration);
  const start = candidate.startTime, end = candidate.endTime;
  if (candidate.status !== "completed" || duration === null || duration > 2147483647 || !start || !end ||
      !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return null;
  return { media_call_started_at: start, media_call_ended_at: end, media_call_duration_seconds: duration };
}

/** Existing original-account recovery supplies the actual Call; no provider I/O under locks. */
export async function recordVoiceCustomerCallTiming(owner: VoiceReservation, candidate: VoiceCustomerCallObservation) {
  return db.transaction(async (tx) => {
    await tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, owner.workspace)).for("no key update");
    const [current] = await tx.select().from(reservations).where(and(
      eq(reservations.id, owner.id), eq(reservations.workspace, owner.workspace),
    )).for("update");
    if (!current || !sameCustomer(current, owner) || !current.send_started_at || !current.provider_sid ||
        current.state === "released" || !matchesVoiceRecipient(current, candidate))
      throw new VoiceRecordingBindingError("Customer Call timing has a different funded owner");
    const clock = callClock(candidate);
    if (!clock) return null;
    if (current.media_call_started_at) {
      if (current.media_call_started_at.getTime() !== clock.media_call_started_at.getTime() ||
          current.media_call_ended_at?.getTime() !== clock.media_call_ended_at.getTime() ||
          current.media_call_duration_seconds !== clock.media_call_duration_seconds)
        throw new VoiceRecordingBindingError("Customer Call timing conflicts with its saved receipt");
      if (voiceCustomerMediaBoundary(current)) await retainVoiceRecordingBoundaryWork(tx, current);
      return current;
    }
    const [saved] = await tx.update(reservations).set({ ...clock, updated_at: new Date() }).where(eq(reservations.id, current.id)).returning();
    if (!saved) throw new Error("Customer Call timing was not saved");
    if (voiceCustomerMediaBoundary(saved)) await retainVoiceRecordingBoundaryWork(tx, saved);
    return saved;
  });
}

/** A customer end ceiling does not establish complete Conference membership. */
export function voiceCustomerMediaBoundary(owner: VoiceReservation) {
  const duration = terminalVoiceCallDuration(owner.terminal_status, owner.terminal_duration);
  if (owner.terminal_status !== "completed" || duration === null || !owner.provider_sid) return null;
  if (owner.media_call_started_at) {
    if (!owner.media_call_ended_at || owner.media_call_duration_seconds !== duration) return null;
    return { source: "provider-call" as const, customerSid: owner.provider_sid, startedAt: owner.media_call_started_at,
      endedAt: owner.media_call_ended_at, durationSeconds: duration };
  }
  return owner.terminal_event_at ? { source: "call-progress" as const, customerSid: owner.provider_sid,
    eventAt: owner.terminal_event_at, sequence: owner.terminal_event_sequence, durationSeconds: duration } : null;
}
