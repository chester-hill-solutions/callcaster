import { useEffect, useRef } from "react";
import { pollCallStatus } from "@/lib/call-status-polling.client";

export interface UseCallStatusPollingOptions {
  callSid: string | null;
  workspaceId: string;
  enabled: boolean;
  intervalMs?: number;
  agentLegSid?: string | null;
  onStatus?: (status: string, resolvedSid?: string) => void;
}

const DEFAULT_INTERVAL_MS = 5000;

/**
 * Polls the call-status-poll API every intervalMs while enabled.
 *
 * One Effect task owns one committed identity (workspace, call SID, agent leg).
 * A change to any of them interrupts the old task and starts a new one, so a
 * read for a call the screen has already left cannot publish. Raw provider
 * status is normalized via `normalizeProviderStatus` before being forwarded, so
 * callers never receive unknown/invalid status strings.
 */
export function useCallStatusPolling({
  callSid,
  workspaceId,
  enabled,
  intervalMs = DEFAULT_INTERVAL_MS,
  agentLegSid,
  onStatus,
}: UseCallStatusPollingOptions): void {
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  /**
   * @effect Poll the provider call status serially for one committed call/agent-leg identity; the Effect task aborts on exit or identity change.
   * @effect-deps enabled, callSid, workspaceId, agentLegSid, intervalMs (the committed polling identity)
   * @effect-side-effects Effect task + fetch; abort on unmount or identity replacement
   * @effect-why-not-loader Provider status is live server state that keeps changing after the call starts; a loader cannot poll.
   */
  useEffect(() => {
    if (!enabled || !callSid || !workspaceId) return;
    const params = new URLSearchParams({
      callSid,
      workspaceId,
      agentLegSid: agentLegSid ?? "",
    });
    return pollCallStatus(
      `/api/call-status-poll?${params}`,
      intervalMs,
      (status, resolvedSid) => {
        onStatusRef.current?.(status, resolvedSid);
      },
    );
  }, [enabled, callSid, workspaceId, agentLegSid, intervalMs]);
}
