import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { loadAudienceUploadStatus } from "@/lib/audience-upload-status.server";
import { getDualAuthUser, requireDualAuth } from "@/lib/api-auth.server";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import { AppError } from "@/lib/errors.server";
import { defineLoader } from "@/lib/handler.server";

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

      const status = await loadAudienceUploadStatus(workspaceId, uploadId);
      if (!status) {
        return routeData({ ok: false as const, error: "Upload not found" }, { status: 404 });
      }
      return routeData({ ok: true as const, snapshot: status.snapshot });
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
