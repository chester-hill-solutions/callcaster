import { useCallback } from "react";
import type { Call } from "@twilio/voice-sdk";
import {
  normalizeProviderStatus,
  getStateMachineAction,
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
  setDisposition: (disposition: string) => void;
  send: CallStateMachineSend;
};

export function useCampaignCallFlow({
  callSid,
  workspaceId,
  state,
  activeCall,
  recentAttemptDisposition,
  predictiveState,
  setDisposition,
  send,
}: UseCampaignCallFlowOptions) {
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
        setDisposition(normalized);
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
      dispositionValue: string | undefined,
      activeCallValue: ActiveCall | null,
    ): string => {
      if (callStateValue === "failed" || dispositionValue === "failed") return "failed";
      if (
        dispositionValue === "ringing" ||
        (activeCallValue && !(dispositionValue === "in-progress"))
      )
        return "dialing";
      if (dispositionValue === "in-progress") return "connected";
      if (dispositionValue === "no-answer") return "no-answer";
      if (dispositionValue === "voicemail") return "voicemail";
      if (callStateValue === "completed" && dispositionValue) return "completed";
      if (!activeCallValue && !dispositionValue) return "idle";
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
                recentAttemptDisposition || undefined,
                activeCall as unknown as ActiveCall,
              );

  const displayColor =
    displayState === "failed"
      ? "hsl(var(--primary))"
      : displayState === "connected" || displayState === "dialing"
        ? "#4CA83D"
        : "#333333";

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

