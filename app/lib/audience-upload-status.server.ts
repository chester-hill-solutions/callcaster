import { findAudienceUploadById } from "@/lib/audience-upload-db.server";
import { getAudienceImportProgress } from "@/lib/audience-import-report.server";
import { markAudienceUploadInterruptedIfStale } from "@/lib/audience-upload-process.server";
import { downloadObject } from "@/lib/object-storage.server";
import { logger } from "@/lib/logger.server";
import type { AudienceUploadServerSnapshot } from "@/components/audience/audience-upload-phase";

async function readStatusFile(
  workspaceId: string,
  uploadId: number,
): Promise<Record<string, unknown>> {
  try {
    const buffer = await downloadObject(
      "audience-uploads",
      `${workspaceId}/${uploadId}.json`,
    );
    const value: unknown = JSON.parse(buffer.toString("utf8"));
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch (error) {
    logger.debug("audience_upload.status.sidecar_unavailable", {
      workspaceId,
      uploadId,
      error,
    });
    return {};
  }
}

function fallbackCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

export async function loadAudienceUploadStatus(
  workspaceId: string,
  uploadId: number,
) {
  let upload = await findAudienceUploadById(workspaceId, uploadId);
  if (!upload) return null;
  let metadata = await readStatusFile(workspaceId, uploadId);

  if (upload.status === "processing") {
    try {
      const result = await markAudienceUploadInterruptedIfStale({
        workspaceId,
        uploadId,
        dbStatus: upload.status,
        statusFileData: metadata,
      });
      metadata = result.statusFileData;
    } catch (error) {
      logger.error("audience_upload.status.watchdog_failed", {
        workspaceId,
        uploadId,
        error,
      });
    }
    // The SQL write can succeed before storage fails, or completion can win the
    // conditional update. Return the persisted outcome in either case.
    upload = await findAudienceUploadById(workspaceId, uploadId);
    if (!upload) return null;
  }

  const durable = upload.import_run_id
    ? await getAudienceImportProgress(
        workspaceId,
        upload.import_run_id,
        upload.audience_id,
      )
    : null;
  return projectStatus(workspaceId, upload, metadata, durable);
}

function projectStatus(
  workspaceId: string,
  upload: NonNullable<Awaited<ReturnType<typeof findAudienceUploadById>>>,
  metadata: Record<string, unknown>,
  durable: Awaited<ReturnType<typeof getAudienceImportProgress>> | null,
) {
  const completed = upload.status === "completed";
  const terminal = completed || upload.status === "error";
  const defaultStage = completed
    ? "Upload completed"
    : upload.status === "error"
      ? "Upload failed"
      : "Processing contacts";
  const legacyError =
    typeof metadata.error_message === "string"
      ? metadata.error_message
      : typeof metadata.error === "string"
        ? metadata.error
        : null;
  const snapshot = {
    uploadId: upload.id,
    report_available: Boolean(durable),
    audience_id: upload.audience_id,
    status: upload.status,
    file_name: upload.file_name,
    file_size: upload.file_size,
    total_contacts: upload.total_contacts,
    processed_contacts: upload.processed_contacts,
    error_message: completed
      ? null
      : (upload.error_message ?? (durable ? null : legacyError)),
    stage:
      durable || terminal
        ? defaultStage
        : typeof metadata.stage === "string"
          ? metadata.stage
          : defaultStage,
    skipped_invalid_contacts: durable
      ? durable.invalid
      : fallbackCount(metadata.skipped_invalid_contacts),
    skipped_duplicate_contacts: durable
      ? durable.duplicates
      : fallbackCount(metadata.skipped_duplicate_contacts),
  } satisfies AudienceUploadServerSnapshot;

  const extra = { ...metadata };
  delete extra.error;
  if ("progress" in extra) {
    extra.progress = completed
      ? 100
      : upload.total_contacts > 0
        ? Math.min(
            100,
            Math.max(
              0,
              Math.round(
                (upload.processed_contacts / upload.total_contacts) * 100,
              ),
            ),
          )
        : 0;
  }
  if ("id" in extra) extra.id = upload.id;
  return {
    snapshot,
    upload: {
      ...extra,
      ...snapshot,
      upload_id: upload.id,
      audienceId: upload.audience_id,
      workspaceId,
      import_run_id: upload.import_run_id,
    },
  };
}
