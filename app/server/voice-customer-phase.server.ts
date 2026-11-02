import { createHash, randomUUID } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { job, workspace_voice_customer_phase as phases, workspace_voice_customer_phase_event as events,
  workspace_voice_recording_operation as recordings, workspace_voice_reservation as reservations } from "@/db/schema";
import { VoiceAudioBindingError } from "@/lib/voice-audio-connection";
import { voiceCustomerPhaseLabel, type VoiceCustomerPhaseInstruction } from "@/lib/voice-customer-phase";
import { parseTwilioVoiceSequence, parseTwilioVoiceTimestamp } from "@/lib/twilio/voice-event-clock";
import { RECORDING_SIDE_EFFECTS_JOB_TYPE } from "@/lib/worker/job-types.server";
import { isObject } from "@/lib/type-safety-utils";
import { createTenantDb } from "./tenant-db";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import type { VoiceReservation } from "./voice-credit-reservation.server";
import type { VoiceAudioConnection } from "./voice-audio-connection.server";

type Phase = typeof phases.$inferSelect;
export type VoiceCustomerPhaseEvent = {
  requestUrl: string; accountSid: string; conferenceId: string; conferenceSid: string; callSid: string; participantLabel: string;
  event: string; timestamp?: string | null; sequenceNumber?: string; muted?: string; hold?: string; reason?: string;
};
const instructionSchema = z.object({ id: z.uuid(), digest: z.string().regex(/^[0-9a-f]{64}$/) });
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value, (_key, entry: unknown) =>
  isObject(entry) && !Array.isArray(entry) ? Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]])) : entry,
)).digest("hex");

/** The successful one-grant UPDATE and capture registration precede this insert. */
export async function saveVoiceCustomerPhase(tx: CreditTransaction, owner: VoiceReservation, input: VoiceCustomerPhaseInstruction) {
  const intent = instructionSchema.parse(input);
  if (!owner.user_id || !owner.provider_sid || !owner.audio_connection_id || owner.audio_generation == null ||
      !owner.conference_id || !owner.conference_sid || !owner.audio_conference_callback || !owner.customer_recording_id ||
      owner.customer_phase_id !== intent.id || !owner.recipient_instruction_issued_at)
    throw new VoiceAudioBindingError("Customer phase has no granted instruction");
  const [phase] = await createTenantDb(owner.workspace, tx).workspace_voice_customer_phase.insert({
    id: intent.id, reservation_id: owner.id, user_id: owner.user_id, capability: "phone-conference-v1",
    logical_call_sid: owner.provider_sid, customer_call_sid: owner.provider_sid, account_sid: owner.account_sid,
    audio_connection_id: owner.audio_connection_id, audio_generation: owner.audio_generation,
    conference_sid: owner.conference_sid, conference_name: owner.conference_id, callback_url: owner.audio_conference_callback,
    recording_operation_id: owner.customer_recording_id, participant_label: voiceCustomerPhaseLabel(owner.id, intent.id),
    instruction_digest: intent.digest,
  });
  if (!phase) throw new Error("Customer phase was not saved");
  return phase;
}

function canonicalFacts(input: VoiceCustomerPhaseEvent) {
  return { requestUrl: input.requestUrl, accountSid: input.accountSid, conferenceId: input.conferenceId,
    conferenceSid: input.conferenceSid, callSid: input.callSid, participantLabel: input.participantLabel, event: input.event,
    timestamp: input.timestamp ?? null, sequenceNumber: input.sequenceNumber ?? null,
    muted: input.muted ?? null, hold: input.hold ?? null, reason: input.reason ?? null };
}

export function phaseMatchesReservation(phase: Phase, owner: VoiceReservation) {
  return owner.state !== "released" && owner.customer_phase_id === phase.id && owner.id === phase.reservation_id && owner.workspace === phase.workspace &&
    owner.user_id === phase.user_id && owner.account_sid === phase.account_sid && owner.provider_sid === phase.customer_call_sid &&
    phase.logical_call_sid === phase.customer_call_sid && owner.audio_connection_id === phase.audio_connection_id &&
    owner.audio_generation === phase.audio_generation && owner.conference_id === phase.conference_name &&
    owner.conference_sid === phase.conference_sid && owner.audio_conference_callback === phase.callback_url &&
    owner.customer_recording_id === phase.recording_operation_id &&
    owner.recipient_instruction_issued_at?.getTime() === phase.issued_at.getTime();
}

function matchesPhaseEvent(phase: Phase, input: Pick<VoiceCustomerPhaseEvent,
  "requestUrl" | "accountSid" | "conferenceId" | "conferenceSid" | "callSid" | "participantLabel">) {
  return input.requestUrl === phase.callback_url && input.accountSid === phase.account_sid &&
    input.conferenceId === phase.conference_name && input.conferenceSid === phase.conference_sid &&
    input.callSid === phase.customer_call_sid && input.participantLabel === phase.participant_label;
}

/** A late receipt owns a new wake key even if an earlier boundary job completed. */
async function retainPhaseWork(tx: CreditTransaction, phase: Phase, eventKey: string) {
  const part = await createTenantDb(phase.workspace, tx).workspace_voice_recording_operation.findFirst({
    where: and(eq(recordings.id, phase.recording_operation_id), eq(recordings.reservation_id, phase.reservation_id)),
  });
  if (!part?.audio_url) return;
  await tx.insert(job).values({ type: RECORDING_SIDE_EFFECTS_JOB_TYPE, workspace_id: phase.workspace, user_id: phase.user_id,
    params: { recordingOperationId: part.id, leaseToken: part.lease_token },
    idempotency_key: `voice_customer_phase:${phase.id}:${eventKey}`, status: "queued",
  }).onConflictDoNothing();
}

/** Caller owns the existing workspace/audio fence. Conflicts are returned after being saved. */
export async function recordVoiceCustomerPhaseEvent(tx: CreditTransaction, owner: VoiceAudioConnection, input: VoiceCustomerPhaseEvent) {
  const tdb = createTenantDb(owner.workspace, tx);
  const candidates = await tdb.workspace_voice_customer_phase.findMany({ where: and(eq(phases.account_sid, owner.account_sid),
    or(eq(phases.customer_call_sid, input.callSid), eq(phases.participant_label, input.participantLabel))), limit: 3 });
  if (!candidates.length) return null;
  let reservation: VoiceReservation | null = null, conflict = candidates.length !== 1;
  const facts = canonicalFacts(input), key = fingerprint(facts);
  for (const phase of candidates) {
    const current = await tdb.workspace_voice_reservation.findFirst({ where: eq(reservations.id, phase.reservation_id) });
    await tx.insert(events).values({ id: randomUUID(), workspace: owner.workspace, phase_id: phase.id, facts,
      fingerprint: key, occurred_at: parseTwilioVoiceTimestamp(input.timestamp), sequence_number: parseTwilioVoiceSequence(input.sequenceNumber),
    }).onConflictDoNothing();
    const matches = current && phaseMatchesReservation(phase, current) && matchesPhaseEvent(phase, input);
    // Distinct signed facts remain in the journal. The proof reader withholds
    // media; the existing live presence owner still orders valid customer events.
    if (!matches) conflict = true;
    else { reservation = current; await retainPhaseWork(tx, phase, key); }
  }
  return { reservation, conflict };
}

export { canonicalFacts, fingerprint as voiceCustomerPhaseFingerprint, matchesPhaseEvent };
