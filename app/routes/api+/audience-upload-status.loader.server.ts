import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { findAudienceUploadById } from "@/lib/audience-upload-db.server";
import { markAudienceUploadInterruptedIfStale } from "@/lib/audience-upload-process.server";
import { getDualAuthUser, requireDualAuth } from "@/lib/api-auth.server";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import { AppError } from "@/lib/errors.server";
import { downloadObject } from "@/lib/object-storage.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: ({ request }) => requireDualAuth(request),
  sideEffects: ["db-read", "db-write", "external"],
  handler: async ({ url, auth }) => {
    const user = getDualAuthUser(auth);
    if (!user) {
      return routeData({ error: "Unauthorized" }, { status: 401 });
    }

    const uploadIdStr = url.searchParams.get("uploadId");
    const workspaceId = url.searchParams.get("workspaceId");

    if (!uploadIdStr || !workspaceId) {
      return routeData(
        { error: "Missing required parameters" },
        { status: 400 },
      );
    }

    const uploadId = parseInt(uploadIdStr, 10);
    if (isNaN(uploadId)) {
      return routeData({ error: "Invalid upload ID" }, { status: 400 });
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
        return routeData({ error: "Upload not found" }, { status: 404 });
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

      // Staleness watchdog: `processAudienceUpload` runs fire-and-forget in
      // the request process that created it. If that process restarted
      // mid-run, the row is stuck at "processing" forever and the client
      // would poll indefinitely. Write-through on read: if progress hasn't
      // been updated in 10 minutes, mark the upload failed.
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
              typeof statusFileData.error === "string"
                ? statusFileData.error
                : uploadData.error_message,
          };
        }
      } catch (error) {
        logger.error("audience_upload.status.watchdog_failed", {
          workspaceId,
          uploadId,
          error,
        });
      }

      return routeData({
        ...statusFileData,
        uploadId: uploadData.id,
        audience_id: uploadData.audience_id,
        status: uploadData.status,
        file_name: uploadData.file_name,
        file_size: uploadData.file_size,
        total_contacts: uploadData.total_contacts,
        processed_contacts: uploadData.processed_contacts,
        error_message: uploadData.error_message,
        stage:
          typeof statusFileData.stage === "string"
            ? statusFileData.stage
            : uploadData.status === "completed"
              ? "Upload completed"
              : uploadData.status === "error"
                ? "Upload failed"
                : "Processing contacts",
      });
    } catch (error) {
      if (error instanceof AppError) {
        logger.error("audience_upload.status.access_or_app_error", {
          workspaceId,
          uploadId,
          statusCode: error.statusCode,
          error: error.message,
        });
        return routeData(
          { error: error.message },
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
          error: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 },
      );
    }
  },
});
