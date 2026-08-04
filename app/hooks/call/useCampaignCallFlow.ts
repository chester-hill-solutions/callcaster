import { useCallback, useEffect, useRef, useState } from "react";
import type { Call } from "@twilio/voice-sdk";
import {
  normalizeProviderStatus,
  getStateMachineAction,
  type CallStatusEnum,
} from "@/lib/call-status";
import { useCallStatusPolling } from "@/hooks/call/useCallStatusPolling";
import { useWorkspaceEventSubscription } from "@/hooks/realtime/useWorkspaceEventSubscription";
import type {
  ActiveCall,
  Campaign,
  Contact,
  OutreachAttempt,
  QueueItem,
} from "@/lib/types";

type CallStateMachineSend = (action: { type: string }) => void;

type PredictiveState = {
  contact_id: number | null;
  status: string;
};

type UseCampaignCallFlowOptions = {
  callSid: string | null;
  workspaceId: string;
  state: string;
  activeCall: Call | null;
  recentAttemptDisposition: string | null | undefined;
  predictiveState: PredictiveState;
  send: CallStateMachineSend;
};

export function useCampaignCallFlow({
  callSid,
  workspaceId,
  state,
  activeCall,
  recentAttemptDisposition,
  predictiveState,
  send,
}: UseCampaignCallFlowOptions) {
  const [providerState, setProviderState] = useState<{
    callSid: string | null;
    status: CallStatusEnum | null;
  }>({ callSid: null, status: null });
  const providerStatus =
    providerState.callSid === callSid ? providerState.status : null;
  const pollingEnabled =
    !!callSid &&
    !!workspaceId &&
    (state === "dialing" || state === "connected");

  function dispatchCallStatus(normalized: CallStatusEnum) {
    const action = getStateMachineAction(normalized);
    if (action === "CONNECT") send({ type: "CONNECT" });
    else if (action === "HANG_UP") send({ type: "HANG_UP" });
    else if (action === "FAIL") send({ type: "FAIL" });
  }

  useCallStatusPolling({
    callSid,
    workspaceId,
    enabled: pollingEnabled,
    intervalMs: 5000,
    onStatus: (status) => {
      const normalized = normalizeProviderStatus(status);
      if (normalized) {
        setProviderState({ callSid, status: normalized });
        dispatchCallStatus(normalized);
      }
    },
  });

  const callSidRef = useRef(callSid);
  callSidRef.current = callSid;

  // Opens a second EventSource to the same workspace events endpoint that
  // useWorkspaceRealtime already connects to. Eliminating this would require
  // restructuring useCallScreen's hook call order (useWorkspaceRealtime runs
  // before useCampaignCallFlow, creating a circular dependency on callbacks).
  // The overhead is negligible — SSE connections are lightweight — and the
  // 5-second polling fallback remains as a safety net for both paths.
  useWorkspaceEventSubscription({
    workspaceId,
    table: "call",
    filter: `workspace=eq.${workspaceId}`,
    onChange: (payload) => {
      const callRow = payload.new as { sid?: string; status?: string } | null;
      if (!callRow?.sid || !callRow?.status) return;
      if (callRow.sid !== callSidRef.current) return;

      const normalized = normalizeProviderStatus(callRow.status);
      if (!normalized) return;

      setProviderState({ callSid: callRow.sid, status: normalized });
      dispatchCallStatus(normalized);
    },
  });

  /**
   * @effect Reset provider call state back to idle when the active call SID
   * clears (call ended, navigated away, or component unmount).
   * @effect-deps callSid (only fires when the tracked SID changes to null)
   * @effect-side-effects none (plain setState)
   * @effect-why-not-loader Call lifecycle state is ephemeral client state,
   * not request/response data.
   */
  useEffect(() => {
    if (!callSid) {
      setProviderState({ callSid: null, status: null });
    }
  }, [callSid]);

  const getDisplayState = useCallback(
    (
      callStateValue: string,
      statusValue: string | undefined,
      activeCallValue: ActiveCall | null,
    ): string => {
      if (callStateValue === "failed" || statusValue === "failed" || statusValue === "busy") {
        return "failed";
      }
      if (
        statusValue === "initiated" ||
        statusValue === "queued" ||
        statusValue === "ringing" ||
        (activeCallValue && statusValue !== "in-progress")
      ) {
        return "dialing";
      }
      if (statusValue === "in-progress") return "connected";
      if (statusValue === "no-answer") return "no-answer";
      if (statusValue === "voicemail") return "voicemail";
      if (
        statusValue === "completed" ||
        statusValue === "canceled" ||
        (callStateValue === "completed" && statusValue)
      ) {
        return "completed";
      }
      if (!activeCallValue && !statusValue) return "idle";
      return "idle";
    },
    [],
  );

  const displayState =
    predictiveState.status === "dialing"
      ? "dialing"
      : predictiveState.status === "connected"
        ? state === "dialing" ? "dialing" : "connected"
        : predictiveState.status === "completed"
          ? "completed"
          : predictiveState.status === "idle"
            ? "idle"
            : getDisplayState(
                state,
                providerStatus ?? recentAttemptDisposition ?? undefined,
                activeCall as unknown as ActiveCall,
              );

  const displayColor =
    displayState === "failed"
      ? "var(--primary)"
      : displayState === "connected" || displayState === "dialing"
        ? "var(--success)"
        : "var(--muted-foreground)";

  return {
    displayState,
    displayColor,
    getDisplayState,
  };
}

/** @deprecated Use useCampaignDialActions instead */
export type StartCallArgs = {
  contact: Contact;
  campaign: Campaign;
  user: { id: string };
  workspaceId: string;
  nextRecipient: QueueItem | null;
  recentAttempt: OutreachAttempt | null;
  selectedDevice: string | null;
};

