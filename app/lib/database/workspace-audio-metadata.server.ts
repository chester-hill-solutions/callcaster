/**
 * Read/write the `workspace_audio` sidecar.
 *
 * The library itself is an S3 listing; this table only annotates it. Two rules
 * follow from that and are load-bearing:
 *
 * 1. A row may be absent. Objects created before this table existed have no
 *    row, so every read degrades to "unknown metadata" and never to a broken
 *    reference. Callers must handle null.
 * 2. `file_name` is the join key, not an id, because every consumer
 *    (campaign.voicedrop_audio, inbound_queue.hold_audio, IVR steps, ...)
 *    stores a bare filename.
 *
 * See client/migrations/20260715120000_workspace_audio_metadata.sql.
 */
import { and, eq, inArray } from "drizzle-orm";

import { workspace_audio as workspaceAudioTable } from "@/db/schema";
import { db } from "@/server/db";

export type AudioOrigin = "upload" | "recording" | "clip";

export type WorkspaceAudioMetadata = {
  file_name: string;
  origin: AudioOrigin;
  duration_ms: number | null;
  size_bytes: number | null;
  content_type: string | null;
  source_file_name: string | null;
  clip_start_ms: number | null;
  clip_end_ms: number | null;
  created_by: string | null;
};

/** What a caller must supply to record a new object. */
export type UpsertAudioMetadataInput = {
  workspaceId: string;
  fileName: string;
  origin: AudioOrigin;
  durationMs?: number | null;
  sizeBytes?: number | null;
  contentType?: string | null;
  createdBy?: string | null;
  /** Required when origin is "clip"; rejected otherwise (DB CHECK enforces). */
  clip?: {
    sourceFileName: string;
    startMs: number;
    endMs: number;
  };
};

const SELECTION = {
  file_name: workspaceAudioTable.file_name,
  origin: workspaceAudioTable.origin,
  duration_ms: workspaceAudioTable.duration_ms,
  size_bytes: workspaceAudioTable.size_bytes,
  content_type: workspaceAudioTable.content_type,
  source_file_name: workspaceAudioTable.source_file_name,
  clip_start_ms: workspaceAudioTable.clip_start_ms,
  clip_end_ms: workspaceAudioTable.clip_end_ms,
  created_by: workspaceAudioTable.created_by,
};

function toMetadata(row: {
  file_name: string;
  origin: string;
  duration_ms: number | null;
  size_bytes: number | null;
  content_type: string | null;
  source_file_name: string | null;
  clip_start_ms: number | null;
  clip_end_ms: number | null;
  created_by: string | null;
}): WorkspaceAudioMetadata {
  return { ...row, origin: row.origin as AudioOrigin };
}

export async function getAudioMetadata(
  workspaceId: string,
  fileName: string,
): Promise<WorkspaceAudioMetadata | null> {
  const rows = await db
    .select(SELECTION)
    .from(workspaceAudioTable)
    .where(
      and(
        eq(workspaceAudioTable.workspace_id, workspaceId),
        eq(workspaceAudioTable.file_name, fileName),
      ),
    )
    .limit(1);

  const row = rows[0];
  return row ? toMetadata(row) : null;
}

/**
 * Metadata for many objects at once, keyed by file name.
 *
 * The list page must stay one query — probing each object for its duration
 * would mean downloading the whole library on every page view.
 */
export async function listAudioMetadata(
  workspaceId: string,
  fileNames: string[],
): Promise<Map<string, WorkspaceAudioMetadata>> {
  if (fileNames.length === 0) return new Map();

  const rows = await db
    .select(SELECTION)
    .from(workspaceAudioTable)
    .where(
      and(
        eq(workspaceAudioTable.workspace_id, workspaceId),
        inArray(workspaceAudioTable.file_name, fileNames),
      ),
    );

  return new Map(rows.map((row) => [row.file_name, toMetadata(row)]));
}

/**
 * Record (or re-record) an object's metadata.
 *
 * Conflicts on (workspace_id, file_name) update in place: an overwrite of an
 * existing object should refresh its duration rather than fail.
 */
export async function upsertAudioMetadata(
  input: UpsertAudioMetadataInput,
): Promise<void> {
  const now = new Date().toISOString();

  // Mirror the DB CHECK rather than letting a constraint violation surface as
  // an opaque 500: a clip is exactly a source plus a window, anything else is
  // a caller bug.
  if (input.origin === "clip" && !input.clip) {
    throw new Error("A clip requires a source file and a start/end window.");
  }
  if (input.origin !== "clip" && input.clip) {
    throw new Error(`Only clips may carry a source window (got "${input.origin}").`);
  }

  const values = {
    workspace_id: input.workspaceId,
    file_name: input.fileName,
    origin: input.origin,
    duration_ms: input.durationMs ?? null,
    size_bytes: input.sizeBytes ?? null,
    content_type: input.contentType ?? null,
    source_file_name: input.clip?.sourceFileName ?? null,
    clip_start_ms: input.clip?.startMs ?? null,
    clip_end_ms: input.clip?.endMs ?? null,
    created_by: input.createdBy ?? null,
    created_at: now,
    updated_at: now,
  };

  await db
    .insert(workspaceAudioTable)
    .values(values)
    .onConflictDoUpdate({
      target: [workspaceAudioTable.workspace_id, workspaceAudioTable.file_name],
      set: {
        origin: values.origin,
        duration_ms: values.duration_ms,
        size_bytes: values.size_bytes,
        content_type: values.content_type,
        source_file_name: values.source_file_name,
        clip_start_ms: values.clip_start_ms,
        clip_end_ms: values.clip_end_ms,
        updated_at: now,
      },
    });
}

/** Drop the annotation for a deleted object. Safe when no row exists. */
export async function deleteAudioMetadata(
  workspaceId: string,
  fileName: string,
): Promise<void> {
  await db
    .delete(workspaceAudioTable)
    .where(
      and(
        eq(workspaceAudioTable.workspace_id, workspaceId),
        eq(workspaceAudioTable.file_name, fileName),
      ),
    );
}
