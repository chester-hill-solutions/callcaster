import { randomUUID } from "node:crypto";
import { and, desc, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { workspace_voice_recording_operation as recordings } from "@/db/schema";
import { callRecordingPartStoragePath } from "@/lib/call-recording-storage.server";
import { VoiceRecordingBindingError } from "@/lib/voice-recording";
import { db } from "./db";
import { createTenantDb } from "./tenant-db";
import { deferVoiceRecordingWork, withVoiceRecordingOperation, type VoiceRecordingOperation } from "./voice-recording-operation.server";

const LEASE_MS = 5 * 60_000;
function needsCopy(row: VoiceRecordingOperation) {
  return row.provider_status === "completed" && row.provider_sid !== null && row.terminal_at !== null && row.audio_url === null;
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
    if (current.lease_token !== leaseToken || !needsCopy(current)) return null;
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
