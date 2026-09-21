import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { logger } from "@/lib/logger.client";

type UseCampaignExportArgs = {
  campaignId: string | number | null | undefined;
  workspaceId: string | number | null | undefined;
};

/**
 * Starts a campaign export and polls its status.
 *
 * Owns the one implementation of the export flow (POST /api/campaign-export,
 * then poll /api/campaign-export-status every 2s). The admin and campaign
 * surfaces differ only in copy, so they share this hook instead of duplicating
 * the state machine and the poll.
 */
export function useCampaignExport({
  campaignId,
  workspaceId,
}: UseCampaignExportArgs) {
  const campaignIdStr = campaignId == null ? "" : String(campaignId);
  const workspaceIdStr = workspaceId == null ? "" : String(workspaceId);
  const canExport = campaignIdStr !== "" && workspaceIdStr !== "";

  const [isExporting, setIsExporting] = useState(false);
  const [exportId, setExportId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  /**
   * @effect Poll the campaign export status every 2s until it completes or errors.
   * @effect-deps exportId (starts polling when an export is created); workspaceIdStr is sent with the status request.
   * @effect-side-effects timer (setInterval) + fetch (status endpoint); the interval stops on a terminal status and is cleared on unmount.
   * @effect-why-not-loader Export status is live server state that changes after the POST returns; a loader cannot observe it.
   */
  useEffect(() => {
    if (!exportId) {
      return;
    }

    let cancelled = false;
    const intervalId = setInterval(async () => {
      try {
        const response = await fetch(
          `/api/campaign-export-status?exportId=${encodeURIComponent(exportId)}&workspaceId=${encodeURIComponent(workspaceIdStr)}`,
        );
        const data = await response.json();

        // A transient 404/500 must not end polling — skip this tick and retry.
        if (cancelled || !response.ok || typeof data?.status !== "string") return;

        if (data.progress) setProgress(data.progress);

        if (data.status === "completed") {
          cancelled = true;
          clearInterval(intervalId);
          setIsExporting(false);
          setDownloadUrl(data.downloadUrl);
          toast.success("Export completed", {
            description: "Your campaign data export is ready for download.",
          });
        } else if (data.status === "error") {
          cancelled = true;
          clearInterval(intervalId);
          setIsExporting(false);
          toast.error("Export failed", {
            description: data.error || "An error occurred during export.",
          });
        }
      } catch (error) {
        logger.error("Error checking export status:", error);
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [exportId, workspaceIdStr]);

  const startExport = useCallback(async () => {
    if (!canExport) {
      toast.error("Export failed", {
        description: "Missing campaign or workspace ID",
      });
      return;
    }

    setIsExporting(true);
    setDownloadUrl(null);

    try {
      const formData = new FormData();
      formData.append("campaignId", campaignIdStr);
      formData.append("workspaceId", workspaceIdStr);

      const response = await fetch("/api/campaign-export", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (response.ok) {
        setExportId(data.exportId);
        toast.info("Export started", {
          description:
            "Your campaign data export has started. This may take a few minutes for large campaigns.",
        });
      } else {
        setIsExporting(false);
        toast.error("Export failed", {
          description: data.error || "Failed to start export.",
        });
      }
    } catch (error) {
      setIsExporting(false);
      toast.error("Export failed", {
        description: "An error occurred while starting the export.",
      });
      logger.error("Export error:", error);
    }
  }, [canExport, campaignIdStr, workspaceIdStr]);

  return { isExporting, progress, downloadUrl, canExport, startExport };
}
