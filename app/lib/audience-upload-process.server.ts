import { logger } from "@/lib/logger.server";
import { uploadObject } from "@/lib/object-storage.server";
import {
  isProcessingStale,
  PROCESSING_INTERRUPTED_MESSAGE,
} from "@/lib/processing-watchdog.server";
import { and, eq, sql } from "drizzle-orm";
import {
  audience_upload as audienceUploadTable,
} from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
import { householdKeyFor } from "@/lib/household-key";
import { parsePhoneNumber } from "@/lib/phone";
import type { AudienceUploadSidecar } from "@/components/audience/audience-upload-phase";
import {
  audienceUploadChunkDelayMs,
  audienceUploadShouldWriteStatus,
} from "../../shared/audience-upload";
import { prepareAudienceImport } from "@/lib/audience-import-map";
import { startAudienceImport, advanceAudienceImport, finishAudienceImport, recordAudienceImportFailure,
  type AudienceImportContext, type AudienceImportRun } from "@/lib/audience-import-recovery.server";

interface CSVContact {
  [key: string]: string;
}

export type VoterListSource =
  | "liberalist"
  | "van"
  | "elections_canada"
  | "elections_ontario"
  | "manual"
  | "other";

export const VOTER_LIST_SOURCE_ALIASES: Record<string, VoterListSource> = {
  liberalist: "liberalist",
  lib: "liberalist",
  van: "van",
  vanid: "van",
  "van id": "van",
  elections_canada: "elections_canada",
  "elections canada": "elections_canada",
  ec: "elections_canada",
  elections_ontario: "elections_ontario",
  "elections ontario": "elections_ontario",
  eo: "elections_ontario",
  manual: "manual",
  other: "other",
};

export function normalizeVoterListSource(
  raw: string | null | undefined,
): VoterListSource | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  return VOTER_LIST_SOURCE_ALIASES[lower] ?? null;
}

// Type guard for other_data array
export function isOtherDataArray(
  value: unknown,
): value is Array<{ key: string; value: unknown }> {
  return Array.isArray(value) && value.every(item =>
    typeof item === 'object' &&
    item !== null &&
    'key' in item &&
    'value' in item
  );
}

/**
 * Phone-based dedupe over the parsed CSV rows, run once before any chunking so
 * `total_contacts` (the progress denominator) reflects only rows that will
 * actually be processed.
 *
 * - Within-file duplicates: first occurrence wins; later rows with the same
 *   normalized phone are dropped and counted.
 * - Existing-audience duplicates: rows whose normalized phone is already in
 *   `existingPhones` are dropped and counted.
 * - Rows whose phone does not parse are NOT deduped here — they keep the
 *   existing invalid-phone behavior downstream (skippedInvalidCount).
 */
export function dedupeParsedContacts(
  rows: CSVContact[],
  phoneHeader: string | null,
  existingPhones: ReadonlySet<string>,
): { rows: CSVContact[]; skippedDuplicateCount: number } {
  if (!phoneHeader) {
    return { rows, skippedDuplicateCount: 0 };
  }

  const seen = new Set<string>();
  let skippedDuplicateCount = 0;
  const deduped = rows.filter((row) => {
    const normalized = parsePhoneNumber(row[phoneHeader] ?? null);
    // Unparseable phones fall through to the invalid-phone skip downstream.
    if (!normalized) return true;
    if (seen.has(normalized) || existingPhones.has(normalized)) {
      skippedDuplicateCount += 1;
      return false;
    }
    seen.add(normalized);
    return true;
  });

  return { rows: deduped, skippedDuplicateCount };
}

export type ChunkHouseholdPlanEntry = {
  household_key: string;
  address: string | null;
  city: string | null;
  province: string | null;
  postal: string | null;
};

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * Household stamping plan for one chunk of mapped contacts.
 *
 * `keys[i]` is the household key for `chunk[i]` (null when the row has no
 * usable address+postal). `entries` holds the distinct keys in the chunk with
 * address/city/province/postal populated from the FIRST row bearing each key —
 * used to find-or-create `households` rows in a single batched insert.
 */
export function chunkHouseholdPlan(
  // Loose record shape: reads address/city/province/postal when present.
  chunk: ReadonlyArray<Record<string, unknown>>,
): { entries: ChunkHouseholdPlanEntry[]; keys: Array<string | null> } {
  const entries: ChunkHouseholdPlanEntry[] = [];
  const seen = new Set<string>();

  const keys = chunk.map((row) => {
    const address = asOptionalString(row.address);
    const postal = asOptionalString(row.postal);
    const key = householdKeyFor(address, postal);
    if (!key) return null;
    if (!seen.has(key)) {
      seen.add(key);
      entries.push({
        household_key: key,
        address,
        city: asOptionalString(row.city),
        province: asOptionalString(row.province),
        postal,
      });
    }
    return key;
  });

  return { entries, keys };
}

// Generate a unique ID without using uuid package
export const generateUniqueId = () => {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${randomStr}`;
};

async function writeAudienceUploadStatus(
  workspaceId: string,
  uploadId: number,
  status: AudienceUploadSidecar,
): Promise<void> {
  // Stamp updated_at on every write (called once per processed chunk) so the
  // staleness watchdog in the status loader can tell a live upload from one
  // abandoned by a mid-run restart. See app/lib/processing-watchdog.server.ts.
  await uploadObject(
    "audience-uploads",
    `${workspaceId}/${uploadId}.json`,
    JSON.stringify({ ...status, updated_at: new Date().toISOString() }),
    {
      contentType: "application/json",
      upsert: true,
    },
  );
}

/**
 * Staleness watchdog for the polling status loader: `processAudienceUpload`
 * runs in the durable worker. Legacy uploads can still have no job row.
 * The watchdog must not fail an upload with a queued or live worker claim.
 *
 * Call this from the status loader (write-through on read): if the DB row
 * is "processing" and the object-storage status blob hasn't been updated
 * in PROCESSING_STALE_MS, mark both the DB row and the status blob failed.
 */
export async function markAudienceUploadInterruptedIfStale(args: {
  workspaceId: string;
  uploadId: number;
  dbStatus: string;
  statusFileData: Record<string, unknown>;
  now?: Date;
}): Promise<{ interrupted: boolean; statusFileData: Record<string, unknown> }> {
  const { workspaceId, uploadId, dbStatus, statusFileData, now } = args;

  if (dbStatus !== "processing") {
    return { interrupted: false, statusFileData };
  }

  const updatedAt =
    typeof statusFileData.updated_at === "string"
      ? statusFileData.updated_at
      : typeof statusFileData.created_at === "string"
        ? statusFileData.created_at
        : undefined;

  if (!isProcessingStale(updatedAt, now)) {
    return { interrupted: false, statusFileData };
  }

  const tdb = createTenantDb(workspaceId);
  const changed = await tdb.audience_upload.update({
    set: { status: "error", error_message: PROCESSING_INTERRUPTED_MESSAGE },
    where: and(eq(audienceUploadTable.id, uploadId), eq(audienceUploadTable.status, "processing"),
      sql`not exists (select 1 from job where type = 'audience_upload'
        and workspace_id = ${workspaceId}::uuid and params->>'uploadId' = ${String(uploadId)}
        and ((status = 'queued' and attempt_count < max_attempts)
          or (status = 'running' and claimed_until > clock_timestamp())))`),
  });
  if (!changed.length) return { interrupted: false, statusFileData };

  const nextStatusFileData: AudienceUploadSidecar = {
    ...statusFileData,
    status: "error",
    error_message: PROCESSING_INTERRUPTED_MESSAGE,
    stage: "Upload failed",
  };
  await writeAudienceUploadStatus(workspaceId, uploadId, nextStatusFileData);

  logger.error("audience_upload.watchdog.interrupted", {
    workspaceId,
    uploadId,
  });

  return {
    interrupted: true,
    statusFileData: { ...nextStatusFileData, updated_at: (now ?? new Date()).toISOString() },
  };
}

export const processAudienceUpload = async (args: AudienceImportContext & {
  fileContent: string;
  headerMapping: Record<string, string>;
  splitNameColumn: string | null;
  voterListSource?: VoterListSource | null;
}) => {
  const { uploadId, audienceId, workspaceId, userId, fileContent, headerMapping, splitNameColumn, voterListSource, claim } = args;
  if (!claim) throw new Error("Audience import requires a worker claim");
  const ctx = { uploadId, audienceId, workspaceId, userId, claim };
  const statusData = { uploadId, audienceId, workspaceId, created_at: new Date().toISOString() };
  try {
    const prepared = prepareAudienceImport(Buffer.from(fileContent, "base64"), headerMapping,
      splitNameColumn, voterListSource ?? null);
    let run = await startAudienceImport(ctx, prepared);
    await writeAudienceUploadStatus(workspaceId, uploadId, importSidecar(run, statusData));
    let lastProgressAt = 0;
    while (run.next_index < run.source_rows) {
      run = await advanceAudienceImport(ctx, run.id, prepared);
      const now = Date.now();
      if (audienceUploadShouldWriteStatus({ total: run.source_rows, isLastChunk: run.next_index === run.source_rows,
        lastProgressAt, now })) {
        await writeAudienceUploadStatus(workspaceId, uploadId, importSidecar(run, statusData));
        lastProgressAt = now;
      }
      const delay = audienceUploadChunkDelayMs(run.source_rows);
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    }
    run = await finishAudienceImport(ctx, run.id);
    await writeAudienceUploadStatus(workspaceId, uploadId, importSidecar(run, statusData));
    return { ok: true, uploadId, audienceId, runId: run.id, imported: run.imported,
      skippedInvalid: run.invalid, skippedDuplicates: run.duplicates };
  } catch (error) {
    logger.error("Upload processing error:", error);
    const message = error instanceof Error ? error.message : "Unknown import error";
    try {
      if (await recordAudienceImportFailure(ctx, message)) {
        await writeAudienceUploadStatus(workspaceId, uploadId, { ...statusData, status: "error", error_message: message });
      }
    } catch (reportError) {
      logger.error("Audience import failure report could not be saved", reportError);
    }
    throw error;
  }
};

function importSidecar(run: AudienceImportRun, status: AudienceUploadSidecar): AudienceUploadSidecar {
  return { ...status, status: run.state, import_run_id: run.id,
    progress: run.source_rows === 0 ? (run.state === "completed" ? 100 : 0) : Math.round(run.next_index / run.source_rows * 100),
    stage: run.state === "completed"
      ? `Upload completed (${run.imported} imported; ${run.invalid} invalid skipped; ${run.duplicates} duplicates skipped)`
      : `Processing contacts (${run.next_index - run.duplicates}/${run.source_rows - run.duplicates}; ${run.invalid} skipped)`,
    skipped_invalid_contacts: run.invalid, skipped_duplicate_contacts: run.duplicates };
}
