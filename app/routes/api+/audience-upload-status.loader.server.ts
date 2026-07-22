import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { findAudienceUploadById } from "@/lib/audience-upload-db.server";
import { markAudienceUploadInterruptedIfStale } from "@/lib/audience-upload-process.server";
import { getDualAuthUser, requireDualAuth } from "@/lib/api-auth.server";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import { AppError } from "@/lib/errors.server";
import { downloadObject } from "@/lib/object-storage.server";
import { defineLoader } from "@/lib/handler.server";
import type { AudienceUploadServerSnapshot } from "@/components/audience/audience-upload-phase";

function sidecarErrorMessage(
  statusFileData: Record<string, unknown>,
): string | null {
  if (typeof statusFileData.error_message === "string") {
    return statusFileData.error_message;
  }
  // Legacy blobs wrote `error` before the wire/API collision was fixed.
  if (typeof statusFileData.error === "string") {
    return statusFileData.error;
  }
  return null;
}

function defaultStage(dbStatus: string | null | undefined): string {
  if (dbStatus === "completed") return "Upload completed";
  if (dbStatus === "error") return "Upload failed";
  return "Processing contacts";
}

export const loader = defineLoader({
  auth: ({ request }) => requireDualAuth(request),
  sideEffects: ["db-read", "db-write", "external"],
  handler: async ({ url, auth }) => {
    const user = getDualAuthUser(auth);
    if (!user) {
      return routeData({ ok: false as const, error: "Unauthorized" }, { status: 401 });
    }

    const uploadIdStr = url.searchParams.get("uploadId");
    const workspaceId = url.searchParams.get("workspaceId");

    if (!uploadIdStr || !workspaceId) {
      return routeData(
        { ok: false as const, error: "Missing required parameters" },
        { status: 400 },
      );
    }

    const uploadId = parseInt(uploadIdStr, 10);
    if (isNaN(uploadId)) {
      return routeData(
        { ok: false as const, error: "Invalid upload ID" },
        { status: 400 },
      );
    }

    try {
      await requireWorkspaceAccess({ user, workspaceId });

      let uploadData;
      try {
        uploadData = await findAudienceUploadById(workspaceId, uploadId);
      } catch (error) {
        logger.error("audience_upload.status.db_lookup_failed", {
          workspaceId,
          uploadId,
          error,
        });
        throw error;
      }

      if (!uploadData) {
        return routeData(
          { ok: false as const, error: "Upload not found" },
          { status: 404 },
        );
      }

      // Sidecar is best-effort progress metadata. DB row remains the source of
      // truth so missing/broken object storage must not fail the poll.
      let statusFileData: Record<string, unknown> = {};
      try {
        const statusBuffer = await downloadObject(
          "audience-uploads",
          `${workspaceId}/${uploadId}.json`,
        );
        statusFileData = JSON.parse(statusBuffer.toString()) as Record<
          string,
          unknown
        >;
      } catch (error) {
        logger.debug("audience_upload.status.sidecar_unavailable", {
          workspaceId,
          uploadId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Staleness watchdog: if progress hasn't been updated in 10 minutes,
      // mark the upload failed (write-through on read).
      try {
        const watchdogResult = await markAudienceUploadInterruptedIfStale({
          workspaceId,
          uploadId,
          dbStatus: uploadData.status,
          statusFileData,
        });
        if (watchdogResult.interrupted) {
          statusFileData = watchdogResult.statusFileData;
          uploadData = {
            ...uploadData,
            status: "error",
            error_message:
              sidecarErrorMessage(statusFileData) ?? uploadData.error_message,
          };
        }
      } catch (error) {
        logger.error("audience_upload.status.watchdog_failed", {
          workspaceId,
          uploadId,
          error,
        });
      }

      const snapshot: AudienceUploadServerSnapshot = {
        uploadId: uploadData.id,
        audience_id: uploadData.audience_id,
        status: uploadData.status,
        file_name: uploadData.file_name,
        file_size: uploadData.file_size,
        total_contacts: uploadData.total_contacts,
        processed_contacts: uploadData.processed_contacts,
        error_message:
          uploadData.error_message ?? sidecarErrorMessage(statusFileData),
        stage:
          typeof statusFileData.stage === "string"
            ? statusFileData.stage
            : defaultStage(uploadData.status),
        skipped_invalid_contacts:
          typeof statusFileData.skipped_invalid_contacts === "number"
            ? statusFileData.skipped_invalid_contacts
            : null,
        skipped_duplicate_contacts:
          typeof statusFileData.skipped_duplicate_contacts === "number"
            ? statusFileData.skipped_duplicate_contacts
            : null,
      };

      return routeData({ ok: true as const, snapshot });
    } catch (error) {
      if (error instanceof AppError) {
        logger.error("audience_upload.status.access_or_app_error", {
          workspaceId,
          uploadId,
          statusCode: error.statusCode,
          error: error.message,
        });
        return routeData(
          { ok: false as const, error: error.message },
          { status: error.statusCode },
        );
      }
      logger.error("audience_upload.status.fetch_failed", {
        workspaceId,
        uploadId,
        error,
      });
      return routeData(
        {
          ok: false as const,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 },
      );
    }
  },
});
