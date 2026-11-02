import { eq } from "drizzle-orm";
import { z } from "zod";
import { workspace_voice_customer_phase as phases, workspace_voice_customer_phase_event as events } from "@/db/schema";
import { parseTwilioVoiceSequence, parseTwilioVoiceTimestamp } from "@/lib/twilio/voice-event-clock";
import { createTenantDb } from "./tenant-db";
import { phaseMatchesReservation, matchesPhaseEvent, voiceCustomerPhaseFingerprint } from "./voice-customer-phase.server";
import { voiceCustomerMediaBoundary } from "./voice-customer-media-boundary.server";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import type { VoiceReservation } from "./voice-credit-reservation.server";

const factSchema = z.object({
  requestUrl: z.string(), accountSid: z.string(), conferenceId: z.string(), conferenceSid: z.string(),
  callSid: z.string(), participantLabel: z.string(), event: z.string(), timestamp: z.string().nullable(),
  sequenceNumber: z.string().nullable(), muted: z.string().nullable(), hold: z.string().nullable(), reason: z.string().nullable(),
}).strict();
const pending = (reason: string) => ({ state: "pending" as const, reason });
type Phase = typeof phases.$inferSelect;
type PhaseEvent = typeof events.$inferSelect;

function validateEvent(phase: Phase, row: PhaseEvent) {
  const parsed = factSchema.safeParse(row.facts);
  if (!parsed.success || voiceCustomerPhaseFingerprint(parsed.data) !== row.fingerprint || !matchesPhaseEvent(phase, parsed.data))
    return pending("customer_phase_history_conflict");
  const facts = parsed.data;
  if (!["participant-join", "participant-leave"].includes(facts.event) ||
      facts.hold !== null && facts.hold !== "false" || facts.muted !== null && facts.muted !== "false")
    return pending("customer_phase_unsupported_state");
  const at = parseTwilioVoiceTimestamp(facts.timestamp);
  if (!at || !row.occurred_at || at.getTime() !== row.occurred_at.getTime() ||
      parseTwilioVoiceSequence(facts.sequenceNumber ?? undefined) !== row.sequence_number)
    return pending("customer_phase_time_unproven");
  return { state: "valid" as const, event: facts.event };
}

function readVisits(phase: Phase, rows: PhaseEvent[]) {
  if (rows.length > 1000) return pending("customer_phase_history_limit");
  const joins: PhaseEvent[] = [], leaves: PhaseEvent[] = [];
  for (const row of rows) {
    const result = validateEvent(phase, row);
    if (result.state !== "valid") return result;
    (result.event === "participant-join" ? joins : leaves).push(row);
  }
  if (joins.length > 1 || leaves.length > 1) return pending("customer_phase_history_conflict");
  const joinedAt = joins[0]?.occurred_at, leftAt = leaves[0]?.occurred_at;
  if (!joinedAt || !leftAt) return pending("customer_phase_history_incomplete");
  return { state: "visits" as const, joinedAt, leftAt, join: joins[0]?.fingerprint, leave: leaves[0]?.fingerprint };
}

/** Caller holds workspace then reservation. This closes membership, not sample-accurate room media. */
export async function readLockedVoiceCustomerPhase(tx: CreditTransaction, owner: VoiceReservation, recordingId: string) {
  if (!owner.customer_phase_id) return pending("customer_phase_unproven");
  const tdb = createTenantDb(owner.workspace, tx);
  const phase = await tdb.workspace_voice_customer_phase.findFirst({ where: eq(phases.id, owner.customer_phase_id) });
  if (!phase || phase.capability !== "phone-conference-v1" || !phaseMatchesReservation(phase, owner) ||
      phase.recording_operation_id !== recordingId) return pending("customer_phase_owner_mismatch");
  const boundary = voiceCustomerMediaBoundary(owner);
  if (!boundary || boundary.source !== "provider-call") return pending("customer_phase_call_time_unproven");
  const rows = await tdb.workspace_voice_customer_phase_event.findMany({ where: eq(events.phase_id, phase.id), limit: 1001 });
  const visits = readVisits(phase, rows);
  if (visits.state !== "visits") return visits;
  const { joinedAt, leftAt } = visits;
  // Seconds-level equal timestamps can conceal audio. Never infer a zero visit.
  if (leftAt <= joinedAt || joinedAt < boundary.startedAt || leftAt > boundary.endedAt)
    return pending("customer_phase_time_unproven");
  return { state: "bounded" as const, phaseId: phase.id, joinedAt, leftAt,
    fingerprint: voiceCustomerPhaseFingerprint({ phase, join: visits.join, leave: visits.leave, boundary }) };
}
