import { useRef, useCallback } from "react";
import { useInterval } from "@/hooks/utils/useInterval";
import { logger } from "@/lib/logger.client";
import { normalizeProviderStatus } from "@/lib/call-status";

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
 * Uses an in-flight guard so overlapping requests are skipped.
 * Raw provider status is normalized via `normalizeProviderStatus` before being
 * forwarded, so callers never receive unknown/invalid status strings.
 */
export function useCallStatusPolling({
  callSid,
  workspaceId,
  enabled,
  intervalMs = DEFAULT_INTERVAL_MS,
  agentLegSid,
  onStatus,
}: UseCallStatusPollingOptions): void {
  const inFlightRef = useRef(false);

  const poll = useCallback(() => {
    if (!callSid || !workspaceId || inFlightRef.current) return;

    inFlightRef.current = true;
    const params = new URLSearchParams({ callSid, workspaceId, agentLegSid: agentLegSid ?? "" });
    fetch(`/api/call-status-poll?${params}`)
      .then((res) => {
        if (!res.ok) return res.json().then((data) => Promise.reject(data));
        return res.json();
      })
      .then((data: { status?: string; callSid?: string }) => {
        if (typeof data?.status === "string") {
          const normalized = normalizeProviderStatus(data.status);
          if (normalized) {
            onStatus?.(normalized, data.callSid);
          }
        }
      })
      .catch((err) => {
        logger.debug("Call status poll failed", err);
      })
      .finally(() => {
        inFlightRef.current = false;
      });
  }, [callSid, workspaceId, agentLegSid, onStatus]);

  const delay =
    enabled && callSid && workspaceId ? intervalMs : null;
  useInterval(poll, delay);
}
