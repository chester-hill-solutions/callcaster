import { useCallback, useEffect, useRef, useState } from "react";
import type { Call } from "@twilio/voice-sdk";
import {
  normalizeProviderStatus,
  getStateMachineAction,
  type CallStatusEnum,
} from "@/lib/call-status";
import { useCallStatusPolling } from "@/hooks/call/useCallStatusPolling";
import { useWorkspaceEventSubscription } from "@/hooks/realtime/useWorkspaceEventSubscription";
import {
  callLifecycleReducer,
  type CallLifecycleEvent,
  type CallLifecycleState,
  type CallPhase,
  type CallOutcome,
} from "@/lib/twilio/call-session-types";
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
  callSid: string | null;
  agentLegSid: string | null;
  workspaceId: string;
  state: string;
  activeCall: Call | null;
  recentAttemptDisposition: string | null | undefined;
  predictiveState: PredictiveState;
  isPredictive: boolean;
  send: CallStateMachineSend;
};

const INITIAL_LIFECYCLE: CallLifecycleState = {
  phase: "idle",
  outcome: null,
  generation: 0,
  agentSid: null,
  customerSid: null,
};

const TERMINAL_PHASES: ReadonlySet<CallPhase> = new Set(["ending", "ended"]);
const FSM_TERMINAL = new Set(["completed", "failed"]);

function normalizedToOutcome(normalized: CallStatusEnum): CallOutcome {
  if (normalized === "completed" || normalized === "canceled") return normalized;
  if (normalized === "no-answer") return "no-answer";
  if (normalized === "busy" || normalized === "failed") return normalized;
  return null;
}

function isTerminalForOutcome(normalized: CallStatusEnum): boolean {
  return ["completed", "canceled", "failed", "busy", "no-answer"].includes(normalized);
}

export function useCampaignCallFlow({
  callSid,
  agentLegSid,
  workspaceId,
  state: fsmState,
  activeCall,
  recentAttemptDisposition,
  predictiveState,
  isPredictive,
  send,
}: UseCampaignCallFlowOptions) {
  const [lifecycle, setLifecycle] = useState<CallLifecycleState>(INITIAL_LIFECYCLE);
  const [providerStatus, setProviderStatus] = useState<CallStatusEnum | null>(null);
  const [customerLegSid, setCustomerLegSid] = useState<string | null>(null);
  const [pollingTargetSid, setPollingTargetSid] = useState<string | null>(null);

  const agentLegSidRef = useRef(agentLegSid);
  agentLegSidRef.current = agentLegSid;
  const dialGenerationRef = useRef(0);
  const lifecycleRef = useRef(lifecycle);
  lifecycleRef.current = lifecycle;
  const previousFsmRef = useRef(fsmState);

  const pollingEnabled =
    !!pollingTargetSid &&
    !!workspaceId &&
    (lifecycle.phase === "dialing" || lifecycle.phase === "connected");

  function dispatch(event: CallLifecycleEvent) {
    setLifecycle((prev) => callLifecycleReducer(prev, event));
  }

  /**
   * Track a customer-leg status update from any source (SSE or polling).
   * Feeds provider events into the canonical lifecycle and the legacy FSM.
   */
  function acceptCustomerStatus(sid: string, normalized: CallStatusEnum) {
    setCustomerLegSid(sid);
    setPollingTargetSid(sid);
    setProviderStatus(normalized);

    // Drive canonical lifecycle for terminal outcomes.
    if (isTerminalForOutcome(normalized)) {
      const outcome = normalizedToOutcome(normalized);
      dispatch({ type: "PROVIDER_ENDED", outcome });
    }

    // Also drive the legacy FSM for backward compat (all statuses).
    const action = getStateMachineAction(normalized);
    if (action === "CONNECT") send({ type: "CONNECT" });
    else if (action === "HANG_UP") send({ type: "HANG_UP" });
    else if (action === "FAIL") send({ type: "FAIL" });
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

      if (customerLegSid != null) {
        if (callRow.sid !== customerLegSid) return;
      } else {
        const matchesDirect = callRow.sid === callSidRef.current;
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
   * @effect Bridge the legacy FSM (useCallState) transitions into the canonical lifecycle.
   * Only dispatches when fsmState actually changes (not on every render).
   * Skips the initial idle → idle no-op.
   */
  useEffect(() => {
    if (previousFsmRef.current === fsmState) return;
    previousFsmRef.current = fsmState;

    const currentPhase = lifecycleRef.current.phase;
    if (TERMINAL_PHASES.has(currentPhase)) return;

    switch (fsmState) {
      case "dialing":
        dispatch({ type: "START_DIALING" });
        break;
      case "connected":
        dispatch({ type: "CONNECT" });
        break;
      case "completed":
        dispatch({ type: "HANG_UP" });
        break;
      case "failed":
        dispatch({ type: "FAIL" });
        break;
    }
  }, [fsmState]);

  /**
   * @effect Start a new dial generation when agentLegSid changes.
   */
  useEffect(() => {
    if (agentLegSid) {
      dialGenerationRef.current += 1;
      setCustomerLegSid(null);
      setPollingTargetSid(null);
      setProviderStatus(null);
      setLifecycle((prev) =>
        TERMINAL_PHASES.has(prev.phase)
          ? { ...INITIAL_LIFECYCLE, generation: prev.generation + 1 }
          : prev,
      );
    }
  }, [agentLegSid]);

  // ---------------------------------------------------------------------------
  // Display derivation: one source of truth for the call screen UI.
  // ---------------------------------------------------------------------------
  const displayState = ((): string => {
    const { phase } = lifecycle;

    // 1. Terminal lifecycle wins unconditionally — fixes #1206.
    if (TERMINAL_PHASES.has(phase)) {
      const outcome = lifecycle.outcome;
      if (outcome === "completed" || outcome === "canceled") return "completed";
      if (outcome === "failed" || outcome === "busy") return "failed";
      if (outcome === "no-answer") return "no-answer";
      if (outcome === "voicemail") return "voicemail";
      return "completed";
    }

    // 2. Provider non-terminal status fills gap between local and provider state.
    if (providerStatus) {
      if (providerStatus === "in-progress") return "connected";
      if (
        providerStatus === "initiated" ||
        providerStatus === "queued" ||
        providerStatus === "ringing"
      ) {
        return "dialing";
      }
      if (providerStatus === "no-answer") return "no-answer";
    }

    // 3. Non-terminal lifecycle phase.
    if (phase === "dialing") return "dialing";
    if (phase === "connected") return "connected";

    // 4. Predictive dialer broadcasts override when present.
    if (isPredictive) {
      const ps = predictiveState.status;
      if (ps === "dialing" || ps === "connected" || ps === "completed" ||
          ps === "failed" || ps === "no-answer" || ps === "idle") {
        return ps;
      }
    }

    // 5. Recent attempt fallback for terminal displays.
    if (recentAttemptDisposition && lifecycle.phase !== "dialing" && lifecycle.phase !== "connected") {
      const d = recentAttemptDisposition;
      if (d === "voicemail") return "voicemail";
      if (d === "no-answer") return "no-answer";
      if (d === "completed" || d === "failed" || d === "busy") return d;
    }

    // 6. Legacy FSM terminal state as fallback (bridge effect hasn't fired yet).
    if (FSM_TERMINAL.has(fsmState)) return fsmState;

    // 7. FSM dialing/connected as fallback for initial render (before bridge).
    if (fsmState === "dialing") return "dialing";
    if (fsmState === "connected") return "connected";

    return "idle";
  })();

  const displayColor =
    displayState === "failed"
      ? "var(--primary)"
      : displayState === "connected" || displayState === "dialing"
        ? "var(--success)"
        : "var(--muted-foreground)";

  return {
    displayState,
    displayColor,
    getDisplayState: (
      callStateValue: string,
      _statusValue: string | undefined,
      _activeCallValue: ActiveCall | null,
    ): string => {
      return callStateValue === "completed" || callStateValue === "failed"
        ? callStateValue
        : displayState;
    },
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
