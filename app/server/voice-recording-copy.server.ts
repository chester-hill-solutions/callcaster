import { randomUUID } from "node:crypto";
import { voiceCustomerPhaseFingerprint } from "./voice-customer-phase.server";
import { and, desc, eq, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import { call, job, workspace_voice_recording_operation as recordings } from "@/db/schema";
import { callRecordingPartStoragePath, twilioRecordingMp3Url } from "@/lib/call-recording-storage.server";
import { VoiceRecordingBindingError } from "@/lib/voice-recording";
import { db } from "./db";
import { createTenantDb } from "./tenant-db";
import { deferVoiceRecordingWork, withVoiceRecordingOperation, type VoiceRecordingOperation } from "./voice-recording-operation.server";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import type { VoiceReservation } from "./voice-credit-reservation.server";
import { recordingSideEffectsParams } from "@/lib/worker/job-params.server";
import { RECORDING_SIDE_EFFECTS_JOB_TYPE } from "@/lib/worker/job-types.server";

const LEASE_MS = 5 * 60_000;
function needsCopy(row: VoiceRecordingOperation) {
  return row.provider_status === "completed" && row.provider_sid !== null && row.terminal_at !== null && row.audio_url === null;
}

/** The caller owns workspace then reservation locks; late timing cannot lose copied media work. */
export async function retainVoiceRecordingBoundaryWork(tx: CreditTransaction, owner: VoiceReservation) {
  const rows = await createTenantDb(owner.workspace, tx).workspace_voice_recording_operation.findMany({
    where: and(eq(recordings.reservation_id, owner.id), inArray(recordings.kind, ["dial", "customer"]), isNotNull(recordings.audio_url)),
  });
  for (const row of rows) await tx.insert(job).values({ type: RECORDING_SIDE_EFFECTS_JOB_TYPE,
    workspace_id: owner.workspace, user_id: owner.user_id,
    params: recordingSideEffectsParams.parse({ recordingOperationId: row.id, leaseToken: row.lease_token }),
    idempotency_key: owner.customer_phase_id ? `voice_recording_phase_boundary:${row.id}:${voiceCustomerPhaseFingerprint([
      owner.customer_phase_id, owner.media_call_started_at, owner.media_call_ended_at, owner.media_call_duration_seconds,
    ])}` : `voice_recording_boundary:${row.id}`, status: "queued",
  }).onConflictDoNothing();
}

/** An initial root recording owns the existing single-recording playback pointer. */
async function projectInitialRecording(tx: CreditTransaction, row: VoiceRecordingOperation, audioUrl: string) {
  if (row.kind !== "dial" && row.kind !== "customer") return;
  if (!row.provider_sid || row.logical_call_sid !== row.source_call_sid || row.source_parent_sid !== null)
    throw new VoiceRecordingBindingError("Initial recording does not own a root call");
  const [saved] = await createTenantDb(row.workspace, tx).call.update({
    set: { recording_sid: row.provider_sid, recording_url: twilioRecordingMp3Url(row.account_sid, row.provider_sid),
      recording_duration: row.recording_duration_seconds == null ? null : String(row.recording_duration_seconds),
      audio_url: audioUrl, date_updated: new Date() },
    where: and(eq(call.sid, row.logical_call_sid), eq(call.account_sid, row.account_sid),
      eq(call.to, row.source_to), eq(call.from, row.source_from), eq(call.direction, row.source_direction), isNull(call.parent_call_sid),
      or(isNull(call.recording_sid), eq(call.recording_sid, row.provider_sid)), or(isNull(call.audio_url), eq(call.audio_url, audioUrl))),
  });
  if (!saved) throw new Error("Initial recording playback acknowledgement was not saved");
}

/** Save delivery ownership before enqueue; an expired delivery can be reclaimed. */
export async function claimVoiceRecordingCopy(owner: VoiceRecordingOperation) {
  return withVoiceRecordingOperation(owner, async (tx, current) => {
    if (!needsCopy(current) || current.lease_expires_at.getTime() > Date.now()) return null;
    const [claimed] = await tx.update(recordings).set({ lease_token: randomUUID(),
      lease_expires_at: new Date(Date.now() + LEASE_MS), updated_at: new Date(),
    }).where(eq(recordings.id, current.id)).returning();
    if (!claimed) throw new Error("Recording copy delivery was not saved");
    return claimed;
  });
}

/** The queued tenant and lease must both match before any network read. */
export async function startVoiceRecordingCopy(workspaceId: string, operationId: string, leaseToken: string) {
  const row = await createTenantDb(workspaceId).workspace_voice_recording_operation.findFirst({ where: eq(recordings.id, operationId) });
  if (!row) return null;
  return withVoiceRecordingOperation(row, async (tx, current) => {
    if (current.lease_token !== leaseToken || (!needsCopy(current) && !current.audio_url)) return null;
    if (current.audio_url) return current;
    const [started] = await tx.update(recordings).set({ lease_expires_at: new Date(Date.now() + LEASE_MS), updated_at: new Date() })
      .where(eq(recordings.id, current.id)).returning();
    if (!started) throw new Error("Recording copy start was not saved");
    return started;
  });
}

export async function finishVoiceRecordingCopy(owner: VoiceRecordingOperation, audioUrl: string) {
  if (!owner.provider_sid || audioUrl !== callRecordingPartStoragePath({ workspaceId: owner.workspace,
    callSid: owner.logical_call_sid, accountSid: owner.account_sid, recordingSid: owner.provider_sid }))
    throw new VoiceRecordingBindingError("Stored recording path does not match its part");
  return withVoiceRecordingOperation(owner, async (tx, current) => {
    if (current.lease_token !== owner.lease_token || current.provider_sid !== owner.provider_sid || !needsCopy(current)) return false;
    const [saved] = await tx.update(recordings).set({ audio_url: audioUrl, last_error: null, updated_at: new Date() })
      .where(eq(recordings.id, current.id)).returning();
    if (!saved) throw new Error("Stored recording acknowledgement was not saved");
    await projectInitialRecording(tx, saved, audioUrl);
    return true;
  });
}

export function deferVoiceRecordingCopy(owner: VoiceRecordingOperation) {
  return deferVoiceRecordingWork(owner, "Recording copy needs recovery", needsCopy);
}

/** Recent completed parts keep priority over old, unavailable provider media. */
export async function findPendingVoiceRecordingCopies(limit = 100) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Recording recovery limit must be 1 to 100");
  return db.select().from(recordings).where(and(eq(recordings.provider_status, "completed"),
    isNotNull(recordings.provider_sid), isNotNull(recordings.terminal_at), isNull(recordings.audio_url),
    lte(recordings.lease_expires_at, new Date()),
  )).orderBy(desc(recordings.created_at), desc(recordings.id)).limit(limit);
}
