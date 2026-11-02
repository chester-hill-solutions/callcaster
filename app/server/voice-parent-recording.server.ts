import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { call, job, workspace_voice_audio_connection as connections, workspace_voice_recording_operation as recordings, workspace_voice_reservation as reservations } from "@/db/schema";
import { recordingSideEffectsParams } from "@/lib/worker/job-params.server";
import { RECORDING_SIDE_EFFECTS_JOB_TYPE } from "@/lib/worker/job-types.server";
import { matchesVoiceSetupRoot, voiceCallLegIdentity, type VoiceSetupRoot } from "@/lib/voice-bridge-identity";
import { normalizeProviderStatus } from "@/lib/call-status";
import { VoiceRecordingBindingError, voiceRecordingCallbackUrl } from "@/lib/voice-recording";
import { lockVoiceAudioActor } from "./voice-audio-admission.server";
import { hasPendingVoiceAudioConferenceStop, voiceAudioSourceRetirementWhere } from "./voice-audio-classification.server";
import { withVoiceAudioConnection, type VoiceAudioConnection } from "./voice-audio-connection.server";
import { createTenantDb } from "./tenant-db";
import { withVoiceRecordingOperation, type VoiceRecordingOperation } from "./voice-recording-operation.server";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import type { VoiceReservation } from "./voice-credit-reservation.server";

type ParentTarget = { connection: VoiceAudioConnection; reservation: VoiceReservation };
type OriginalManualSource = VoiceAudioConnection & {
  reservation_id: string; original_agent_sid: string; customer_sid: string; provider_sid: string;
};
const LEASE_MS = 5 * 60_000;

function ownsParent(recording: VoiceRecordingOperation, connection: VoiceAudioConnection) {
  return recording.kind === "parent" && recording.workspace === connection.workspace &&
    recording.user_id === connection.user_id && recording.account_sid === connection.account_sid &&
    recording.reservation_id === connection.reservation_id && recording.logical_call_sid === connection.original_agent_sid &&
    recording.source_call_sid === connection.original_agent_sid && recording.source_parent_sid === null;
}

async function parentRecording(tx: CreditTransaction, connection: VoiceAudioConnection) {
  if (!connection.reservation_id) return null;
  const tdb = createTenantDb(connection.workspace, tx);
  const where = and(eq(recordings.reservation_id, connection.reservation_id), eq(recordings.kind, "parent"));
  const row = await tdb.workspace_voice_recording_operation.findFirst({ where: and(where, eq(recordings.intent_id, connection.id)) }) ??
    await tdb.workspace_voice_recording_operation.findFirst({ where: and(where, ne(recordings.state, "failed"), isNull(recordings.terminal_at)) });
  if (row && !ownsParent(row, connection)) throw new VoiceRecordingBindingError("Parent recording has a different owner");
  return row ?? null;
}

/** Accepted identity survives mutable admission changes; this grants no capture readiness. */
export function findVoiceParentRecording(connection: VoiceAudioConnection) {
  return withVoiceAudioConnection(connection, (tx, current) => parentRecording(tx, current));
}

function hasJoinedReplacement(row: VoiceAudioConnection) {
  return ["ready", "switching"].includes(row.state) && row.voice_issued_at !== null && row.joined_at !== null &&
    row.conference_sid !== null && row.cancel_requested_at === null && row.terminal_at === null;
}

function isOriginalManualSource(row: VoiceAudioConnection): row is OriginalManualSource {
  return hasJoinedReplacement(row) && row.target_kind === "direct" && row.reservation_id !== null &&
    row.original_agent_sid !== null && row.customer_sid !== null && row.provider_sid !== null &&
    row.source_connection_id === null && row.source_agent_sid === row.original_agent_sid &&
    row.committed_at === null && row.promotion_result === null;
}

/** The join transaction retains preparation before acknowledging the callback. */
export async function retainVoiceParentRecordingWork(tx: CreditTransaction, row: VoiceAudioConnection) {
  if (!isOriginalManualSource(row)) return;
  await tx.insert(job).values({ type: RECORDING_SIDE_EFFECTS_JOB_TYPE, workspace_id: row.workspace, user_id: row.user_id,
    params: recordingSideEffectsParams.parse({ parentCaptureConnectionId: row.id, version: 1 }),
    idempotency_key: `voice_parent_capture:${row.id}`, status: "queued",
  }).onConflictDoNothing();
}

/** Old or foreign deliveries cannot acquire another connection's capture owner. */
export async function findVoiceParentRecordingWork(workspaceId: string, connectionId: string) {
  const row = await createTenantDb(workspaceId).workspace_voice_audio_connection.findFirst({ where: eq(connections.id, connectionId) });
  return row && isOriginalManualSource(row) ? row : null;
}

function isCurrentReservation(row: VoiceReservation | undefined, connection: OriginalManualSource): row is VoiceReservation {
  return Boolean(row && row.user_id === connection.user_id && row.account_sid === connection.account_sid &&
    row.kind === "staffed" && !row.conference_id && row.state === "active" &&
    connection.target_key === `direct:${row.id}` && connection.caller_id === row.caller_id &&
    row.setup_sid === connection.original_agent_sid && row.provider_sid === connection.customer_sid &&
    (connection.requested_call_sid === row.setup_sid || connection.requested_call_sid === row.provider_sid) &&
    row.setup_continuation_url && row.recipient_instruction_issued_at && !row.setup_terminal_at && !row.terminal_status);
}

function ownsLiveLeg(row: typeof call.$inferSelect | undefined, reservation: VoiceReservation, purpose: "setup" | "recipient") {
  const identity = voiceCallLegIdentity(reservation, purpose);
  return Boolean(row && row.user_id === reservation.user_id && row.account_sid === reservation.account_sid &&
    normalizeProviderStatus(row.status) === "in-progress" && row.to === identity.to && row.from === identity.from &&
    row.parent_call_sid === identity.parent_call_sid && row.direction === identity.direction);
}

async function withParentTarget<T>(connection: VoiceAudioConnection,
  run: (tx: CreditTransaction, target: ParentTarget) => Promise<T>) {
  return withVoiceAudioConnection(connection, async (tx, current) => {
    const actor = await lockVoiceAudioActor(tx, { workspaceId: current.workspace, userId: current.user_id });
    if (!actor.ok || actor.accountSid !== current.account_sid) throw new VoiceRecordingBindingError("Parent recording actor is unavailable");
    if (!isOriginalManualSource(current) || await hasPendingVoiceAudioConferenceStop(actor.tdb, current.user_id))
      throw new VoiceRecordingBindingError("Parent recording requires the current joined replacement");
    const retired = await actor.tdb.workspace_voice_audio_connection.findFirst({ where: voiceAudioSourceRetirementWhere({
      workspaceId: current.workspace, accountSid: current.account_sid, callSid: current.original_agent_sid,
    }), columns: { id: true } });
    const [reservation] = await tx.select().from(reservations).where(and(
      eq(reservations.id, current.reservation_id), eq(reservations.workspace, current.workspace),
    )).for("update");
    if (retired || !isCurrentReservation(reservation, current))
      throw new VoiceRecordingBindingError("Parent recording funded call is no longer current");
    const calls = await actor.tdb.call.findMany({ where: inArray(call.sid, [current.original_agent_sid, current.customer_sid]) });
    if (!ownsLiveLeg(calls.find(row => row.sid === current.original_agent_sid), reservation, "setup") ||
        !ownsLiveLeg(calls.find(row => row.sid === current.customer_sid), reservation, "recipient"))
      throw new VoiceRecordingBindingError("Parent recording requires the live customer bridge");
    return run(tx, { connection: current, reservation });
  });
}

/** Check local ownership before reading the provider; do not hold a transaction over I/O. */
export function readVoiceParentRecordingTarget(connection: VoiceAudioConnection) {
  return withParentTarget(connection, async (_tx, target) => target);
}

export function prepareVoiceParentRecording(connection: VoiceAudioConnection, root: VoiceSetupRoot) {
  return withParentTarget(connection, async (tx, target) => {
    if (!matchesVoiceSetupRoot(target.reservation, root)) throw new VoiceRecordingBindingError("Parent recording source identity changed");
    const existing = await parentRecording(tx, target.connection);
    if (existing) {
      if (existing.state !== "prepared" || existing.lease_expires_at.getTime() > Date.now()) return existing;
      const [renewed] = await tx.update(recordings).set({ lease_token: randomUUID(), lease_expires_at: new Date(Date.now() + LEASE_MS), updated_at: new Date() })
        .where(and(eq(recordings.id, existing.id), eq(recordings.state, "prepared"), isNull(recordings.send_started_at))).returning();
      if (!renewed) throw new Error("Parent recording preparation lease was not saved");
      return renewed;
    }
    const id = randomUUID(), current = target.connection;
    const [saved] = await createTenantDb(current.workspace, tx).workspace_voice_recording_operation.insert({ id,
      reservation_id: target.reservation.id, user_id: current.user_id, kind: "parent", intent_id: current.id,
      account_sid: current.account_sid, logical_call_sid: root.sid, source_call_sid: root.sid,
      source_to: root.to, source_from: root.from, source_direction: root.direction, source_parent_sid: null,
      callback_url: voiceRecordingCallbackUrl(current.voice_url, id), lease_token: randomUUID(),
      lease_expires_at: new Date(Date.now() + LEASE_MS),
    });
    if (!saved) throw new Error("Parent recording preparation was not saved");
    return saved;
  });
}

/** Exactly one committed checkpoint may create a recording on this existing call. */
export function claimVoiceParentRecordingSend(connection: VoiceAudioConnection, owner: VoiceRecordingOperation) {
  return withParentTarget(connection, async (tx, target) => {
    const [current] = await tx.select().from(recordings).where(and(
      eq(recordings.id, owner.id), eq(recordings.workspace, target.connection.workspace),
    )).for("update");
    if (!current || !ownsParent(current, target.connection) || current.lease_token !== owner.lease_token ||
        current.callback_url !== owner.callback_url || current.state !== "prepared" || current.send_started_at || current.provider_sid ||
        current.lease_expires_at.getTime() <= Date.now()) return null;
    if (!matchesVoiceSetupRoot(target.reservation, { sid: current.source_call_sid, accountSid: current.account_sid,
      to: current.source_to, from: current.source_from, direction: current.source_direction, parentCallSid: current.source_parent_sid }))
      throw new VoiceRecordingBindingError("Parent recording checkpoint source changed");
    const [started] = await tx.update(recordings).set({ state: "creating", send_started_at: sql`clock_timestamp()`, updated_at: new Date() })
      .where(eq(recordings.id, current.id)).returning();
    if (!started) throw new Error("Parent recording send checkpoint was not saved");
    return started;
  });
}

/** A definite rejection cannot overwrite an early accepted receipt or a later lease. */
export function failUnacceptedVoiceParentRecording(owner: VoiceRecordingOperation) {
  return withVoiceRecordingOperation(owner, async (tx, current) => {
    if (current.lease_token !== owner.lease_token || current.state !== "creating" || current.provider_sid) return current;
    const [failed] = await tx.update(recordings).set({ state: "failed", last_error: "Provider rejected parent recording", updated_at: new Date() })
      .where(eq(recordings.id, current.id)).returning();
    if (!failed) throw new Error("Parent recording rejection was not saved");
    return failed;
  });
}
