import { useEffect, useRef, useState } from "react";
import { useWorkspaceEventSubscription } from "@/hooks/realtime/useWorkspaceRealtime";
import { pollAudienceUploadStatus } from "@/lib/audience-upload-polling.client";
import { logger } from "@/lib/logger.client";
import { AUDIENCE_UPLOAD_PROCESSING_POLL_MS } from "../../../shared/audience-upload";
import type {
  AudienceUploadProgressState,
  AudienceUploadServerSnapshot,
  AudienceUploadStatusResponse,
} from "./audience-upload-phase";

type UploadAttempt = { uploadId: number; workspaceId: string | undefined };

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
  // Bumped per processing attempt so a retry of the same upload id restarts
  // the poll task instead of reusing the previous attempt's task.
  const [attemptNonce, setAttemptNonce] = useState(0);

  const audienceIdRef = useRef<string | null>(existingAudienceId ?? null);
  const totalContactsRef = useRef(0);
  const handedOffRef = useRef(false);
  const attemptRef = useRef<UploadAttempt | null>(null);
  const workspaceIdRef = useRef(workspaceId);
  workspaceIdRef.current = workspaceId;

  const onUploadCompleteRef = useRef(onUploadComplete);
  const onStandaloneCompleteRef = useRef(onStandaloneComplete);
  onUploadCompleteRef.current = onUploadComplete;
  onStandaloneCompleteRef.current = onStandaloneComplete;

  const uploadId =
    progress.kind === "processing" ? progress.uploadId : null;
  const pollingEnabled = progress.kind === "processing";

  /**
   * @effect Hand a completed upload off to the caller's callback exactly once.
   * @effect-deps [progress] — completion state
   * @effect-side-effects Completion callbacks via refs
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

  const isCurrentAttempt = (
    state: AudienceUploadProgressState,
    attempt: UploadAttempt | null,
  ): state is Extract<AudienceUploadProgressState, { kind: "processing" }> =>
    attempt != null && attemptRef.current === attempt &&
    workspaceIdRef.current === attempt.workspaceId &&
    state.kind === "processing" && state.uploadId === attempt.uploadId;

  const applyServerSnapshot = (snapshot: AudienceUploadServerSnapshot, attempt: UploadAttempt | null) => {
    setProgress((prev) => {
      if (!isCurrentAttempt(prev, attempt) ||
        (snapshot.id != null && String(snapshot.id) !== String(prev.uploadId)) ||
        (snapshot.uploadId != null && snapshot.uploadId !== prev.uploadId)) {
        return prev;
      }

      const nextStatus = snapshot.status || null;
      const reportAvailable = snapshot.report_available ?? (snapshot.import_run_id !== undefined
        ? Boolean(snapshot.import_run_id) : prev.reportAvailable ?? false);
      const serverTotal =
        typeof snapshot.total_contacts === "number"
          ? snapshot.total_contacts
          : null;
      const serverProcessed =
        typeof snapshot.processed_contacts === "number"
          ? snapshot.processed_contacts
          : null;

      if (serverTotal != null && serverTotal >= 0) {
        totalContactsRef.current = serverTotal;
      }

      const totalContacts =
        serverTotal != null && serverTotal >= 0
          ? serverTotal
          : prev.totalContacts || totalContactsRef.current;

      const prevAudienceId = prev.audienceId;
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

      let progressPct = prev.progress;
      if (serverProcessed != null && totalContacts > 0) {
        progressPct = Math.round((serverProcessed / totalContacts) * 100);
      }

      if (nextStatus === "completed") {
        const completedAudienceId = nextAudienceId ?? audienceIdRef.current;
        if (!completedAudienceId) return prev;

        return {
          kind: "completed",
          reportAvailable,
          uploadId: prev.uploadId,
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
          reportAvailable,
          uploadId: prev.uploadId,
          audienceId: nextAudienceId,
          totalContacts,
          processedContacts: serverProcessed ?? prev.processedContacts,
          progress: progressPct,
          skippedInvalidContacts,
          skippedDuplicateContacts,
          message:
            snapshot.error_message || "An error occurred during upload",
        };
      }

      // Missing status: keep current progress view (no orthogonal null reset).
      if (!nextStatus) {
        return prev;
      }

      const uploadIdForState = prev.uploadId;

      return {
        kind: "processing",
        reportAvailable,
        uploadId: uploadIdForState,
        audienceId: nextAudienceId ?? prevAudienceId,
        totalContacts,
        processedContacts:
          serverProcessed != null ? serverProcessed : prev.processedContacts,
        progress: progressPct,
        warning: snapshot.stage ? null : prev.warning,
        skippedInvalidContacts,
        skippedDuplicateContacts,
      };
    });
  };

  const activeAttempt = attemptRef.current;
  useWorkspaceEventSubscription({
    workspaceId: workspaceId ?? "",
    table: "audience_upload",
    ...(uploadId ? { filter: `id=eq.${uploadId}` } : {}),
    onChange: (payload) => {
      if (payload.eventType !== "UPDATE" || !payload.new) return;
      applyServerSnapshot(payload.new as AudienceUploadServerSnapshot, activeAttempt);
    },
  });

  const fetchStatusSnapshot = async (targetUploadId: number, signal: AbortSignal) => {
    const attempt = attemptRef.current;
    if (!targetUploadId || !workspaceId || attempt?.uploadId !== targetUploadId ||
      attempt.workspaceId !== workspaceId) return;
    const setWarning = (warning: string | null) => setProgress(prev =>
      isCurrentAttempt(prev, attempt) ? { ...prev, warning } : prev,
    );
    const delayed = "Live progress is delayed. Retrying automatically...";
    try {
      const response = await fetch(
        `/api/audience-upload-status?uploadId=${targetUploadId}&workspaceId=${workspaceId}`,
        { signal },
      );
      let data: AudienceUploadStatusResponse | null = null;
      try {
        data = (await response.json()) as AudienceUploadStatusResponse;
      } catch (parseError) {
        logger.error("Error parsing upload status response:", parseError);
        setWarning(delayed);
        return;
      }
      if (!response.ok || data == null || data.ok === false) {
        setWarning(delayed);
        return;
      }
      setWarning(null);
      applyServerSnapshot(data.snapshot, attempt);
    } catch (error) {
      if (signal.aborted) return;
      logger.error("Error polling status:", error);
      setWarning(delayed);
    }
  };

  // Latest-ref: the poll task must read the current tenant/attempt without
  // restarting on every render.
  const fetchStatusSnapshotRef = useRef(fetchStatusSnapshot);
  fetchStatusSnapshotRef.current = fetchStatusSnapshot;

  /**
   * @effect Poll the upload status serially for one committed processing attempt; the Effect task aborts on exit or attempt replacement.
   * @effect-deps pollingEnabled, uploadId, workspaceId, attemptNonce (the committed processing identity; the nonce distinguishes a same-id retry)
   * @effect-side-effects Effect task + fetch; abort on unmount or identity replacement
   * @effect-why-not-loader Upload status is live server state that changes after the POST returns; a loader cannot poll.
   */
  useEffect(() => {
    if (!pollingEnabled || uploadId == null || !workspaceId) return;
    return pollAudienceUploadStatus({
      intervalMs: AUDIENCE_UPLOAD_PROCESSING_POLL_MS,
      read: (signal) => fetchStatusSnapshotRef.current(uploadId, signal),
    });
  }, [pollingEnabled, uploadId, workspaceId, attemptNonce]);

  const startSubmitting = (totalContacts: number) => {
    attemptRef.current = null;
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
    attemptRef.current = { uploadId: args.uploadId, workspaceId };
    handedOffRef.current = false;
    audienceIdRef.current = args.audienceId;
    totalContactsRef.current = args.totalContacts;
    setAttemptNonce((nonce) => nonce + 1);
    setProgress({
      kind: "processing",
      uploadId: args.uploadId,
      audienceId: args.audienceId,
      totalContacts: args.totalContacts,
      processedContacts: 0,
      progress: 0,
      warning: null,
    });
  };

  const fail = (message: string) => {
    setProgress(prev => ({ kind: "error", message,
      reportAvailable: prev.kind === "idle" ? false : prev.reportAvailable,
      uploadId: prev.kind === "processing" || prev.kind === "completed" || prev.kind === "error" ? prev.uploadId : null,
      audienceId: audienceIdRef.current,
      totalContacts: prev.kind === "idle" ? 0 : prev.totalContacts,
      processedContacts: prev.kind === "idle" ? 0 : prev.processedContacts,
      progress: prev.kind === "idle" ? 0 : prev.progress,
    }));
  };

  const reset = () => {
    attemptRef.current = null;
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
