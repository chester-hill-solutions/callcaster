import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { logger } from "@/lib/logger.client";
import { pollCampaignExport } from "@/lib/campaign-export-polling.client";

type UseCampaignExportArgs = {
  campaignId: string | number | null | undefined;
  workspaceId: string | number | null | undefined;
  exportType?: "sms-report";
};

export type CampaignExportDownload = {
  label: string;
  filename: string;
  downloadUrl: string;
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
  exportType,
}: UseCampaignExportArgs) {
  const campaignIdStr = campaignId == null ? "" : String(campaignId);
  const workspaceIdStr = workspaceId == null ? "" : String(workspaceId);
  const canExport = campaignIdStr !== "" && workspaceIdStr !== "";
  const identity = JSON.stringify([campaignIdStr, workspaceIdStr, exportType]);
  const identityRef = useRef(identity);
  const attemptRef = useRef<{ identity: string; controller: AbortController } | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [exportId, setExportId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<CampaignExportDownload[]>([]);

  /**
   * @effect Reset export state for the current campaign and tenant; cancel its start request on exit.
   * @effect-deps identity (campaign, workspace and export format).
   * @effect-side-effects abort pending fetch; clear owned export state.
   * @effect-why-not-loader An export attempt is a browser operation that outlives its start request.
   */
  useEffect(() => {
    // A suspended render must not revoke the export still visible on screen.
    identityRef.current = identity;
    setIsExporting(false);
    setExportId(null);
    setProgress(0);
    setDownloadUrl(null);
    setDownloads([]);
    return () => {
      attemptRef.current?.controller.abort();
      attemptRef.current = null;
    };
  }, [identity]);

  /**
   * @effect Poll serially with a two-second delay after each result until completion or error.
   * @effect-deps exportId, identity, workspaceIdStr (the current job and its owner).
   * @effect-side-effects Effect task + fetch; abort on unmount or owner replacement.
   * @effect-why-not-loader Export status is live server state that changes after the POST returns; a loader cannot observe it.
   */
  useEffect(() => {
    const attempt = attemptRef.current;
    if (!exportId || !attempt || attempt.identity !== identity) return;
    return pollCampaignExport(
      `/api/campaign-export-status?exportId=${encodeURIComponent(exportId)}&workspaceId=${encodeURIComponent(workspaceIdStr)}`,
      (data) => {
        if (attemptRef.current !== attempt || identityRef.current !== identity) return;
        if (data.progress != null) setProgress(data.progress);
        if (data.status === "completed") {
          attemptRef.current = null;
          setExportId(null);
          setIsExporting(false);
          setDownloadUrl(data.downloadUrl ?? null);
          setDownloads(data.downloads ?? []);
          toast.success("Export completed", {
            description: "Your campaign data export is ready for download.",
          });
        } else if (data.status === "error") {
          attemptRef.current = null;
          setExportId(null);
          setIsExporting(false);
          toast.error("Export failed", {
            description: data.error || "An error occurred during export.",
          });
        }
      },
    );
  }, [exportId, identity, workspaceIdStr]);

  const startExport = useCallback(async () => {
    if (!canExport) {
      toast.error("Export failed", {
        description: "Missing campaign or workspace ID",
      });
      return;
    }
    if (attemptRef.current) return;
    const attempt = { identity, controller: new AbortController() };
    attemptRef.current = attempt;
    const isCurrent = () => attemptRef.current === attempt && identityRef.current === identity;

    setIsExporting(true);
    setExportId(null);
    setProgress(0);
    setDownloadUrl(null);
    setDownloads([]);

    try {
      const formData = new FormData();
      formData.append("campaignId", campaignIdStr);
      formData.append("workspaceId", workspaceIdStr);
      if (exportType) formData.append("exportType", exportType);

      const response = await fetch("/api/campaign-export", {
        method: "POST",
        body: formData,
        signal: attempt.controller.signal,
      });
      const data = await response.json();
      if (!isCurrent()) return;

      if (response.ok && typeof data?.exportId === "string" && data.exportId !== "") {
        setExportId(data.exportId);
        toast.info("Export started", {
          description:
            "Your campaign data export has started. This may take a few minutes for large campaigns.",
        });
      } else {
        attemptRef.current = null;
        setIsExporting(false);
        toast.error("Export failed", {
          description: data.error || "Failed to start export.",
        });
      }
    } catch (error) {
      if (!isCurrent()) return;
      attemptRef.current = null;
      setIsExporting(false);
      toast.error("Export failed", {
        description: "An error occurred while starting the export.",
      });
      logger.error("Export error:", error);
    }
  }, [canExport, campaignIdStr, workspaceIdStr, exportType, identity]);

  return {
    isExporting,
    progress,
    downloadUrl,
    downloads,
    canExport,
    startExport,
  };
}
