import { useCallback, useState } from "react";
import type { Call } from "@twilio/voice-sdk";
import {
  normalizeProviderStatus,
  getStateMachineAction,
  type CallStatusEnum,
} from "@/lib/call-status";
import { useCallStatusPolling } from "@/hooks/call/useCallStatusPolling";
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

  useCallStatusPolling({
    callSid,
    workspaceId,
    enabled: pollingEnabled,
    intervalMs: 5000,
    onStatus: (status) => {
      const normalized = normalizeProviderStatus(status);
      if (normalized) {
        setProviderState({ callSid, status: normalized });
        const action = getStateMachineAction(normalized);
        if (action === "CONNECT") send({ type: "CONNECT" });
        else if (action === "HANG_UP") send({ type: "HANG_UP" });
        else if (action === "FAIL") send({ type: "FAIL" });
      }
    },
  });

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
        ? "connected"
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

