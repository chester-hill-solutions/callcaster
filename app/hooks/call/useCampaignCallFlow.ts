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
import { logger } from "@/lib/logger.client";

type CallStateMachineSend = (action: { type: string }) => void;

type PredictiveState = {
  contact_id: number | null;
  status: string;
};

type UseCampaignCallFlowOptions = {
  /** SID of the SDK active call (parent/agent leg) or the most recent call */
  callSid: string | null;
  /** SID of the parent REST-created call (the agent/browser leg) — the
   * child customer leg's events carry this as `parent_call_sid`. */
  agentLegSid: string | null;
  workspaceId: string;
  state: string;
  activeCall: Call | null;
  recentAttemptDisposition: string | null | undefined;
  predictiveState: PredictiveState;
  isPredictive: boolean;
  send: CallStateMachineSend;
};

type TerminalOutcome =
  | "completed"
  | "canceled"
  | "failed"
  | "busy"
  | "no-answer"
  | "voicemail"
  | null;

export function useCampaignCallFlow({
  callSid,
  agentLegSid,
  workspaceId,
  state,
  activeCall,
  recentAttemptDisposition,
  predictiveState,
  isPredictive,
  send,
}: UseCampaignCallFlowOptions) {
  const [providerState, setProviderState] = useState<{
    callSid: string | null;
    status: CallStatusEnum | null;
  }>({ callSid: null, status: null });

  const [customerLegSid, setCustomerLegSid] = useState<string | null>(null);
  const [terminalOutcome, setTerminalOutcome] = useState<TerminalOutcome>(null);
  const [pollingTargetSid, setPollingTargetSid] = useState<string | null>(null);

  const agentLegSidRef = useRef(agentLegSid);
  agentLegSidRef.current = agentLegSid;
  const dialGenerationRef = useRef(0);

  const providerStatus =
    providerState.callSid === callSid ||
    (customerLegSid != null && providerState.callSid === customerLegSid)
      ? providerState.status
      : null;
  const pollingEnabled =
    !!pollingTargetSid &&
    !!workspaceId &&
    (state === "dialing" || state === "connected");

  function dispatchCallStatus(normalized: CallStatusEnum) {
    const action = getStateMachineAction(normalized);
    if (action === "CONNECT") send({ type: "CONNECT" });
    else if (action === "HANG_UP") send({ type: "HANG_UP" });
    else if (action === "FAIL") send({ type: "FAIL" });
  }

  /** Track a customer-leg status update from any source (SSE or polling). */
  function acceptCustomerStatus(sid: string, normalized: CallStatusEnum) {
    setCustomerLegSid(sid);
    setPollingTargetSid(sid);
    setProviderState({ callSid: sid, status: normalized });
    dispatchCallStatus(normalized);
    if (isTerminalForOutcome(normalized)) {
      setTerminalOutcome(normalizedToOutcome(normalized));
    }
  }

  function normalizedToOutcome(normalized: CallStatusEnum): TerminalOutcome {
    if (normalized === "completed" || normalized === "canceled") return normalized;
    if (normalized === "no-answer") return "no-answer";
    if (normalized === "busy" || normalized === "failed") return normalized;
    return null;
  }

  function isTerminalForOutcome(normalized: CallStatusEnum): boolean {
    return ["completed", "canceled", "failed", "busy", "no-answer"].includes(normalized);
  }

  // Polling: use the customer leg SID if known, otherwise fall back to
  // the parent/SDK SID (the server will resolve the child for us).
  useCallStatusPolling({
    callSid: pollingTargetSid ?? callSid,
    workspaceId,
    enabled: pollingEnabled,
    intervalMs: 5000,
    agentLegSid,
    onStatus: (status, resolvedSid) => {
      const normalized = normalizeProviderStatus(status);
      if (!normalized) return;
      const sid = resolvedSid ?? pollingTargetSid ?? callSid;
      if (sid) {
        acceptCustomerStatus(sid, normalized);
      }
    },
  });

  const callSidRef = useRef(callSid);
  callSidRef.current = callSid;

  // SSE events: accept direct matches OR child events keyed on parent_call_sid
  useWorkspaceEventSubscription({
    workspaceId,
    table: "call",
    filter: `workspace=eq.${workspaceId}`,
    onChange: (payload) => {
      const callRow = payload.new as {
        sid?: string;
        parent_call_sid?: string;
        status?: string;
      } | null;
      if (!callRow?.sid || !callRow?.status) return;

      // If we already have a customer leg SID, only accept events for that leg.
      if (customerLegSid != null) {
        if (callRow.sid !== customerLegSid) return;
      } else {
        // Accept if the SID matches the SDK call SID (before child is known).
        const matchesDirect = callRow.sid === callSidRef.current;

        // Accept if this is a child event for our tracked parent leg.
        const matchesParent =
          agentLegSidRef.current != null &&
          callRow.parent_call_sid === agentLegSidRef.current;

        if (!matchesDirect && !matchesParent) return;
      }

      const normalized = normalizeProviderStatus(callRow.status);
      if (!normalized) return;

      acceptCustomerStatus(callRow.sid, normalized);
    },
  });

  /**
   * @effect Start a new dial generation when agentLegSid changes (new call
   * placed). Resets customer leg tracking and terminal latch so the new call
   * starts from a clean state.
   * @effect-deps agentLegSid (changes when a new REST call is created for the
   * agent leg)
   * @effect-side-effects none — plain setState calls
   * @effect-why-not-loader Dial lifecycle management is ephemeral client state
   * derived from the SDK's active call identity.
   */
  useEffect(() => {
    if (agentLegSid) {
      dialGenerationRef.current += 1;
      setCustomerLegSid(null);
      setPollingTargetSid(null);
      setTerminalOutcome(null);
    }
  }, [agentLegSid]);

  /**
   * @effect Clear the terminal outcome latch when the FSM enters dialing
   * (via START_DIALING), so the previous call's outcome does not persist into
   * the new call's initial state.
   * @effect-deps state (the FSM's call lifecycle state)
   * @effect-side-effects none — plain setState
   * @effect-why-not-loader FSM state transitions are client-side; server
   * loaders have no concept of a terminal outcome latch.
   */
  useEffect(() => {
    if (state === "dialing") {
      setTerminalOutcome(null);
    }
  }, [state]);

  const getDisplayState = useCallback(
    (
      callStateValue: string,
      statusValue: string | undefined,
      activeCallValue: ActiveCall | null,
    ): string => {
      if (callStateValue === "failed" || statusValue === "failed" || statusValue === "busy") {
        return "failed";
      }
      if (callStateValue === "connected" || statusValue === "in-progress") {
        return "connected";
      }
      if (
        statusValue === "initiated" ||
        statusValue === "queued" ||
        statusValue === "ringing"
      ) {
        return "dialing";
      }
      if (statusValue === "no-answer") return "no-answer";
      if (statusValue === "voicemail") return "voicemail";
      if (
        statusValue === "completed" ||
        statusValue === "canceled" ||
        callStateValue === "completed"
      ) {
        return "completed";
      }
      // No provider status yet: the local FSM covers the gap, since the device
      // hook dispatches START_DIALING the moment the softphone leg
      // moves while provider status arrives later via SSE/polling. Without
      // this the screen sits on "Pending" until the first webhook lands.
      if (callStateValue === "dialing" || (activeCallValue && !statusValue)) {
        return "dialing";
      }
      return "idle";
    },
    [],
  );

  // Predictive campaigns are driven by dialer-room broadcasts; everything else
  // (power dial) must ignore predictiveState — it initializes to "idle" and
  // never updates outside predictive mode, so letting it lead pins the screen
  // on "Pending" forever.
  const predictiveDisplay = !isPredictive
    ? null
    : predictiveState.status === "dialing"
      ? "dialing"
      : predictiveState.status === "connected"
        ? state === "dialing" ? "dialing" : "connected"
        : predictiveState.status === "completed"
          ? "completed"
          : predictiveState.status === "failed"
            ? "failed"
            : predictiveState.status === "no-answer"
              ? "no-answer"
              : predictiveState.status === "idle"
                ? "idle"
                : null;

  // The last attempt's disposition is only a fallback for showing the outcome
  // of a finished call; while a new call is in flight it is stale data from
  // the previous one and must not override the live dialing/connected display.
  const callInFlight = state === "dialing" || state === "connected";
  const displayStatus =
    terminalOutcome ??
    providerStatus ??
    (callInFlight ? undefined : recentAttemptDisposition ?? undefined);

  // Map terminal outcome to display string
  const outcomeDisplay =
    terminalOutcome === "completed" || terminalOutcome === "canceled"
      ? "completed"
      : terminalOutcome === "no-answer"
        ? "no-answer"
        : terminalOutcome === "voicemail"
          ? "voicemail"
          : null;

  const displayState =
    outcomeDisplay ??
    predictiveDisplay ??
    getDisplayState(state, displayStatus, activeCall as unknown as ActiveCall);

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
