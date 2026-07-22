import { useEffect, useRef, useState } from "react";
import { useWorkspaceEventSubscription } from "@/hooks/realtime/useWorkspaceRealtime";
import { useInterval } from "@/hooks/utils/useInterval";
import { logger } from "@/lib/logger.client";
import { AUDIENCE_UPLOAD_PROCESSING_POLL_MS } from "../../../shared/audience-upload";
import type {
  AudienceUploadProgressState,
  AudienceUploadServerSnapshot,
} from "./audience-upload-phase";

type UseAudienceUploadProgressArgs = {
  workspaceId: string | undefined;
  existingAudienceId?: string;
  onUploadComplete?: (audienceId: string) => void;
  onStandaloneComplete?: (audienceId: string) => void;
};

function audienceIdFromSnapshot(
  snapshot: AudienceUploadServerSnapshot,
  fallback: string | null,
): string | null {
  if (snapshot.audience_id != null) {
    return String(snapshot.audience_id);
  }
  return fallback;
}

export function useAudienceUploadProgress({
  workspaceId,
  existingAudienceId,
  onUploadComplete,
  onStandaloneComplete,
}: UseAudienceUploadProgressArgs) {
  const [progress, setProgress] = useState<AudienceUploadProgressState>({
    kind: "idle",
  });

  const audienceIdRef = useRef<string | null>(existingAudienceId ?? null);
  const totalContactsRef = useRef(0);
  const handedOffRef = useRef(false);

  const onUploadCompleteRef = useRef(onUploadComplete);
  const onStandaloneCompleteRef = useRef(onStandaloneComplete);
  onUploadCompleteRef.current = onUploadComplete;
  onStandaloneCompleteRef.current = onStandaloneComplete;

  const uploadId =
    progress.kind === "processing" ? progress.uploadId : null;
  const pollingEnabled = progress.kind === "processing";

  /**
   * @effect Hand a completed upload off to the caller's callback exactly once.
   * @effect-deps progress (fires when the upload state machine reaches "completed")
   * @effect-side-effects none (invokes caller-provided completion callbacks via refs)
   * @effect-why-not-loader Completion arrives asynchronously via realtime/poll
   * snapshots, not a route transition; the callbacks advance the wizard or
   * schedule the standalone redirect.
   */
  useEffect(() => {
    if (progress.kind !== "completed" || handedOffRef.current) return;
    handedOffRef.current = true;
    const audienceId = progress.audienceId;
    if (onUploadCompleteRef.current) {
      onUploadCompleteRef.current(audienceId);
    } else if (onStandaloneCompleteRef.current) {
      onStandaloneCompleteRef.current(audienceId);
    }
  }, [progress]);

  const applyServerSnapshot = (snapshot: AudienceUploadServerSnapshot) => {
    setProgress((prev) => {
      if (prev.kind !== "processing" && prev.kind !== "submitting") {
        return prev;
      }

      const nextStatus = snapshot.status || null;
      const serverTotal =
        typeof snapshot.total_contacts === "number"
          ? snapshot.total_contacts
          : null;
      const serverProcessed =
        typeof snapshot.processed_contacts === "number"
          ? snapshot.processed_contacts
          : null;

      if (serverTotal != null && serverTotal > 0) {
        totalContactsRef.current = serverTotal;
      }

      const totalContacts =
        serverTotal != null && serverTotal > 0
          ? serverTotal
          : prev.totalContacts || totalContactsRef.current;

      const prevAudienceId =
        prev.kind === "processing" ? prev.audienceId : null;
      const nextAudienceId = audienceIdFromSnapshot(
        snapshot,
        audienceIdRef.current ?? prevAudienceId,
      );
      if (nextAudienceId) {
        audienceIdRef.current = nextAudienceId;
      }

      const skippedInvalidContacts =
        typeof snapshot.skipped_invalid_contacts === "number"
          ? snapshot.skipped_invalid_contacts
          : (prev.skippedInvalidContacts ?? null);
      const skippedDuplicateContacts =
        typeof snapshot.skipped_duplicate_contacts === "number"
          ? snapshot.skipped_duplicate_contacts
          : (prev.skippedDuplicateContacts ?? null);

      if (nextStatus === "completed") {
        const completedAudienceId = nextAudienceId ?? audienceIdRef.current;
        if (!completedAudienceId) return prev;

        return {
          kind: "completed",
          audienceId: completedAudienceId,
          totalContacts,
          processedContacts: serverProcessed ?? totalContacts,
          progress: 100,
          skippedInvalidContacts,
          skippedDuplicateContacts,
        };
      }

      if (nextStatus === "error") {
        return {
          kind: "error",
          message:
            snapshot.error_message || "An error occurred during upload",
        };
      }

      // Missing status: keep current progress view (no orthogonal null reset).
      if (!nextStatus) {
        return prev;
      }

      const uploadIdForState =
        prev.kind === "processing" ? prev.uploadId : null;
      if (uploadIdForState == null) return prev;

      let progressPct = prev.progress;
      if (serverProcessed != null && totalContacts > 0) {
        progressPct = Math.round((serverProcessed / totalContacts) * 100);
      }

      return {
        kind: "processing",
        uploadId: uploadIdForState,
        audienceId: nextAudienceId ?? prevAudienceId,
        totalContacts,
        processedContacts:
          serverProcessed != null ? serverProcessed : prev.processedContacts,
        progress: progressPct,
        warning: snapshot.stage
          ? null
          : prev.kind === "processing"
            ? prev.warning
            : null,
        skippedInvalidContacts,
        skippedDuplicateContacts,
      };
    });
  };

  useWorkspaceEventSubscription({
    workspaceId: workspaceId ?? "",
    table: "audience_upload",
    ...(uploadId ? { filter: `id=eq.${uploadId}` } : {}),
    onChange: (payload) => {
      if (payload.eventType !== "UPDATE" || !payload.new) return;
      applyServerSnapshot(payload.new as AudienceUploadServerSnapshot);
    },
  });

  const fetchStatusSnapshot = async (targetUploadId: number) => {
      if (!targetUploadId || !workspaceId) return;

      try {
        const response = await fetch(
          `/api/audience-upload-status?uploadId=${targetUploadId}&workspaceId=${workspaceId}`,
        );

        let data: (AudienceUploadServerSnapshot & { error?: string }) | null =
          null;
        try {
          data = (await response.json()) as AudienceUploadServerSnapshot & {
            error?: string;
          };
        } catch (parseError) {
          logger.error("Error parsing upload status response:", parseError);
          setProgress((prev) =>
            prev.kind === "processing"
              ? {
                  ...prev,
                  warning:
                    "Live progress is delayed. Retrying automatically...",
                }
              : prev,
          );
          return;
        }

        if (!response.ok || data?.error) {
          setProgress((prev) =>
            prev.kind === "processing"
              ? {
                  ...prev,
                  warning:
                    "Live progress is delayed. Retrying automatically...",
                }
              : prev,
          );
          return;
        }

        setProgress((prev) =>
          prev.kind === "processing" ? { ...prev, warning: null } : prev,
        );
        applyServerSnapshot(data ?? {});
      } catch (error) {
        logger.error("Error polling status:", error);
        setProgress((prev) =>
          prev.kind === "processing"
            ? {
                ...prev,
                warning: "Live progress is delayed. Retrying automatically...",
              }
            : prev,
        );
      }
  };

  useInterval(async () => {
    if (uploadId == null) return;
    await fetchStatusSnapshot(uploadId);
  }, pollingEnabled ? AUDIENCE_UPLOAD_PROCESSING_POLL_MS : null);

  const startSubmitting = (totalContacts: number) => {
    handedOffRef.current = false;
    totalContactsRef.current = totalContacts;
    setProgress({
      kind: "submitting",
      totalContacts,
      processedContacts: 0,
      progress: 0,
      warning: null,
    });
  };

  const beginProcessing = (args: {
    uploadId: number;
    audienceId: string;
    totalContacts: number;
  }) => {
    handedOffRef.current = false;
    audienceIdRef.current = args.audienceId;
    totalContactsRef.current = args.totalContacts;
    setProgress({
      kind: "processing",
      uploadId: args.uploadId,
      audienceId: args.audienceId,
      totalContacts: args.totalContacts,
      processedContacts: 0,
      progress: 0,
      warning: null,
    });
    // Small uploads often finish server-side before the first poll tick;
    // check right away instead of waiting out the interval (#1078).
    void fetchStatusSnapshot(args.uploadId);
  };

  const fail = (message: string) => {
    setProgress({ kind: "error", message });
  };

  const reset = () => {
    handedOffRef.current = false;
    setProgress({ kind: "idle" });
  };

  return {
    progress,
    startSubmitting,
    beginProcessing,
    fail,
    reset,
  };
}
