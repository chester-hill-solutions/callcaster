import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import { getDualAuthUser, requireDualAuth } from "@/lib/api-auth.server";
import { downloadObject } from "@/lib/object-storage.server";
import { defineLoader } from "@/lib/handler.server";
import {
  markCampaignExportInterruptedIfStale,
  type CampaignExportStatus,
} from "@/lib/campaign-export-helpers.server";

export const loader = defineLoader({
  auth: ({ request }) => requireDualAuth(request),
  sideEffects: ["db-read", "external"],
  handler: async ({ url, auth }) => {
    const user = getDualAuthUser(auth);
    if (!user) {
      return routeData({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const exportId = url.searchParams.get("exportId");
      const workspaceId = url.searchParams.get("workspaceId");

      if (!exportId || !workspaceId) {
        return routeData({ error: "Missing required parameters" }, { status: 400 });
      }

      // Defense-in-depth: ensure the requesting user can access the workspace whose
      // export status they are attempting to read.
      await requireWorkspaceAccess({ user, workspaceId });

      // Download the status file from object storage
      let statusBuffer: Buffer;
      try {
        statusBuffer = await downloadObject(
          "campaign-exports",
          `${workspaceId}/${exportId}.json`,
        );
      } catch (error) {
        if (error instanceof Error && error.message.includes("Object not found")) {
          return routeData({ error: "Export not found" }, { status: 404 });
        }
        throw error;
      }

      // Read and parse the status data
      let status = JSON.parse(statusBuffer.toString()) as CampaignExportStatus;

      // Staleness watchdog: write-through on read. If the export was left
      // "processing" by a process that restarted mid-run, mark it failed
      // rather than leaving the client to poll forever.
      try {
        const watchdogResult = await markCampaignExportInterruptedIfStale(
          workspaceId,
          exportId,
          status,
        );
        if (watchdogResult.interrupted) {
          status = watchdogResult.statusData;
        }
      } catch (error) {
        logger.error("Error running campaign export staleness watchdog:", error);
      }

      return routeData(status);
    } catch (error) {
      logger.error("Status check error:", error);
      return routeData({
        error: error instanceof Error ? error.message : "Unknown error"
      }, { status: 500 });
    }
  },
});
