import { and, asc, eq, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { workspace_voice_recording_operation as recordings } from "@/db/schema";
import { db } from "./db";
import { deferVoiceRecordingWork, withVoiceRecordingOperation, type VoiceRecordingOperation } from "./voice-recording-operation.server";

/** Row-only lease claims finish before a worker takes the workspace owner lock. */
export async function claimVoiceRecordingRecovery() {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(recordings).where(and(isNotNull(recordings.send_started_at), isNull(recordings.source_parent_sid),
      isNull(recordings.terminal_at), lte(recordings.lease_expires_at, new Date()),
      or(eq(recordings.state, "creating"), and(isNotNull(recordings.provider_sid),
        or(isNull(recordings.provider_status), eq(recordings.provider_status, "in-progress")))),
    )).orderBy(asc(recordings.lease_expires_at), asc(recordings.created_at), asc(recordings.id))
      .limit(25).for("update", { skipLocked: true });
    if (!rows.length) return [];
    return tx.update(recordings).set({ lease_token: sql`gen_random_uuid()`, lease_expires_at: new Date(Date.now() + 5 * 60_000), updated_at: new Date() })
      .where(inArray(recordings.id, rows.map((row) => row.id))).returning();
  });
}

export async function readVoiceRecordingRecovery(owner: VoiceRecordingOperation) {
  return withVoiceRecordingOperation(owner, async (_tx, current) =>
    current.lease_token === owner.lease_token && current.lease_expires_at.getTime() > Date.now() &&
    current.send_started_at && current.source_parent_sid === null && !current.terminal_at ? current : null);
}

/** Errors can retry sooner; a normal pending observation retains its poll lease. */
export function deferVoiceRecordingRecovery(owner: VoiceRecordingOperation) {
  return deferVoiceRecordingWork(owner, "Recording provider observation needs recovery", (current) => !current.terminal_at);
}
