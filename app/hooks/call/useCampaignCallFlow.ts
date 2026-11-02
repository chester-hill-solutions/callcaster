import { useCallback, useEffect, useRef, useState } from "react";
import type { Call } from "@twilio/voice-sdk";
import {
  normalizeProviderStatus,
  getStateMachineAction,
  type CallStatusEnum,
} from "@/lib/call-status";
import { useCustomerCallEvents } from "@/hooks/call/useCustomerCallEvents";
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
import { recordFlashBreadcrumb } from "@/lib/flash-telemetry.client";
import type { RecoveredManualCustomer } from "@/lib/schemas/api/voice-audio";

type CallStateMachineSend = (action: { type: string }) => void;

type PredictiveState = {
  contact_id: number | null;
  status: string;
};

type UseCampaignCallFlowOptions = {
  callSid: string | null;
  confirmedCustomerSid?: string | null;
  manualRecovery?: RecoveredManualCustomer | null;
  allowManualRecovery?: boolean;
  onServerCustomerOwned?: (owned: boolean) => void;
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
type CustomerOwner = { previousSourceSid?: string | null; customerSid: string | null };

function matchesCustomerStatus(owner: CustomerOwner, sid: string, sourceSid: string | null, agentSid: string | null) {
  const expected = owner.customerSid ?? sourceSid;
  if (!expected || sid === agentSid) return false;
  return owner.customerSid !== null || sourceSid !== agentSid ? sid === expected : true;
}

function normalizedToOutcome(normalized: CallStatusEnum): CallOutcome {
  if (normalized === "completed" || normalized === "canceled") return normalized;
  if (normalized === "no-answer") return "no-answer";
  if (normalized === "busy" || normalized === "failed") return normalized;
  return null;
}

function isTerminalForOutcome(normalized: CallStatusEnum): boolean {
  return ["completed", "canceled", "failed", "busy", "no-answer"].includes(normalized);
}

function getCallDisplayState({ lifecycle, providerStatus, isPredictive, predictiveState, fsmState, recentAttemptDisposition }: {
  lifecycle: CallLifecycleState;
  providerStatus: CallStatusEnum | null;
  isPredictive: boolean;
  predictiveState: PredictiveState;
  fsmState: string;
  recentAttemptDisposition: string | null | undefined;
}) {
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

  // 5. A live FSM outranks any *previous* attempt's disposition: the agent
  //    has dialed this contact again, so their last outcome is history.
  //    Below rule 6 this showed the old "No Answer"/"Call Failed" for the
  //    render between the click and the bridge effect.
  if (fsmState === "dialing") return "dialing";
  if (fsmState === "connected") return "connected";

  // 6. Recent attempt fallback for terminal displays.
  if (recentAttemptDisposition && lifecycle.phase !== "dialing" && lifecycle.phase !== "connected") {
    const d = recentAttemptDisposition;
    if (d === "voicemail") return "voicemail";
    if (d === "no-answer") return "no-answer";
    if (d === "completed" || d === "failed" || d === "busy") return d;
  }

  // 7. Legacy FSM terminal state as fallback (bridge effect hasn't fired yet).
  if (FSM_TERMINAL.has(fsmState)) return fsmState;

  return "idle";
}

export function useCampaignCallFlow({
  callSid,
  confirmedCustomerSid = null,
  manualRecovery = null,
  allowManualRecovery = false,
  onServerCustomerOwned,
  agentLegSid,
  workspaceId,
  state: fsmState,
  activeCall,
  recentAttemptDisposition,
  predictiveState,
  isPredictive,
  send,
}: UseCampaignCallFlowOptions) {
  const [lifecycle, setLifecycle] = useState<CallLifecycleState>(() => ({ ...INITIAL_LIFECYCLE,
    phase: fsmState === "dialing" || fsmState === "connected" ? fsmState : "idle" }));
  const [customer, setCustomer] = useState<{ sid: string | null; status: CallStatusEnum | null }>({ sid: null, status: null });
  const { sid: customerLegSid, status: providerStatus } = customer;
  const ownerRef = useRef<CustomerOwner>({ customerSid: null });
  const owner = ownerRef.current;
  const sourceSid = callSid === owner.previousSourceSid ? null : callSid;
  const pollingTargetSid = customerLegSid ?? sourceSid;
  const lifecycleRef = useRef(lifecycle);
  lifecycleRef.current = lifecycle;
  const previousFsmRef = useRef(fsmState);
  const previousSourceRef = useRef(callSid);
  const recoveryRetired = useRef(false);
  const [recoveredManual, setRecoveredManual] = useState<RecoveredManualCustomer | null>(null);

  // A current source can bootstrap before SSE arrives. The source captured
  // before a new Dial belongs to the previous request and cannot bootstrap it.
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
    if (ownerRef.current !== owner || !matchesCustomerStatus(owner, sid, sourceSid, agentLegSid)) return;
    recordFlashBreadcrumb("provider-status", `${normalized} (${sid.slice(0, 8)})`);
    owner.customerSid = sid;
    setCustomer({ sid, status: normalized });

    // Drive canonical lifecycle for terminal outcomes.
    if (isTerminalForOutcome(normalized)) {
      const outcome = normalizedToOutcome(normalized);
      dispatch({ type: "PROVIDER_ENDED", outcome });

      // The provider (Twilio) has already ended the customer leg, but that
      // doesn't guarantee the agent's own WebRTC leg got told — e.g. a
      // conference customer leg with no statusCallback relies solely on
      // endConferenceOnExit reaching the browser. If activeCall is still
      // live here, force it closed so the SDK's own 'disconnect' handling
      // (including its built-in hangup tone) actually runs instead of the
      // call silently lingering. A no-op if the SDK already tore it down.
      // Guarded: with a dead signaling transport this disconnect THROWS
      // (31009), and this runs inside the workspace SSE fan-out.
      try {
        if (!isPredictive) activeCall?.disconnect?.();
      } catch (error) {
        logger.debug("activeCall.disconnect after provider-terminal status failed", error);
      }
    }

    // Also drive the legacy FSM for backward compat (all statuses).
    const action = getStateMachineAction(normalized);
    if (action === "CONNECT") send({ type: "CONNECT" });
    else if (action === "HANG_UP") send({ type: "HANG_UP" });
    else if (action === "FAIL") send({ type: "FAIL" });
  }

  useCustomerCallEvents({ workspaceId, pollingTargetSid, pollingEnabled, agentLegSid, customerLegSid, sourceSid,
    onStatus: acceptCustomerStatus });

  const resetCustomer = useCallback((previousSourceSid: string | null) => {
    // A new request does not own the previous dial's bootstrap SID.
    const nextOwner: CustomerOwner = { previousSourceSid, customerSid: null };
    ownerRef.current = nextOwner;
    setCustomer({ sid: null, status: null });
    setRecoveredManual(null);
    onServerCustomerOwned?.(false);
    return nextOwner;
  }, [onServerCustomerOwned]);

  // Reset in the click's batch: waiting for the FSM effect repaints the old outcome (#1220).
  const beginDial = useCallback(() => {
    recoveryRetired.current = true;
    const requestedOwner = resetCustomer(callSid);
    recordFlashBreadcrumb("begin-dial", "lifecycle reset for new dial");
    setLifecycle((prev) => callLifecycleReducer(prev, { type: "START_DIALING" }));
    return (sid: string) => {
      if (ownerRef.current !== requestedOwner || !/^CA[0-9a-f]{32}$/i.test(sid) || sid === agentLegSid) return false;
      if (requestedOwner.customerSid && requestedOwner.customerSid !== sid) return false;
      if (requestedOwner.customerSid === sid) return true;
      requestedOwner.customerSid = sid;
      setCustomer({ sid, status: "queued" });
      return true;
    };
  }, [callSid, resetCustomer, agentLegSid]);
  const retireManualRecovery = useCallback(() => { recoveryRetired.current = true; }, []);

  /**
   * @effect Restore the saved manual customer into the canonical customer owner.
   * @effect-deps manualRecovery, allowManualRecovery, workspaceId, isPredictive, fsmState, onServerCustomerOwned, send (committed recovery).
   * @effect-side-effects Logical customer state and SDK ownership bridge; no provider command.
   * @effect-why-not-loader Current discovery completes after the page has mounted.
   */
  useEffect(() => {
    if (!manualRecovery || recoveryRetired.current && !allowManualRecovery || isPredictive || manualRecovery.workspace_id !== workspaceId) return;
    const existing = ownerRef.current.customerSid;
    if (existing && existing !== manualRecovery.call_sid) return;
    recoveryRetired.current = true;
    setRecoveredManual(manualRecovery);
    onServerCustomerOwned?.(true);
    // An existing customer can have newer status from SSE or a local Hang Up.
    if (existing) return;
    ownerRef.current.customerSid = manualRecovery.call_sid;
    const status = manualRecovery.provider_status;
    setCustomer({ sid: manualRecovery.call_sid, status });
    setLifecycle(previous => {
      let next = callLifecycleReducer(previous, { type: "START_DIALING" });
      if (status === "in-progress") next = callLifecycleReducer(next, { type: "CONNECT" });
      if (isTerminalForOutcome(status)) next = callLifecycleReducer(next, { type: "PROVIDER_ENDED", outcome: normalizedToOutcome(status) });
      return next;
    });
    previousFsmRef.current = fsmState;
    if (fsmState !== "dialing") send({ type: "START_DIALING" });
    const action = getStateMachineAction(status);
    if (action) send({ type: action });
  }, [manualRecovery, allowManualRecovery, workspaceId, isPredictive, fsmState, onServerCustomerOwned, send]);

  /**
   * @effect Bind the confirmed room customer and bridge legacy FSM transitions into the canonical lifecycle.
   * @effect-deps fsmState, callSid, resetCustomer, confirmedCustomerSid, predictiveState.status, send (committed customer and transition).
   * @effect-side-effects Update the logical customer owner and lifecycle state; remember the last committed source.
   * @effect-why-not-loader SDK and realtime transitions arrive after mount, outside loader requests.
   */
  useEffect(() => {
    const previousSource = previousSourceRef.current;
    previousSourceRef.current = callSid;
    if (confirmedCustomerSid && ownerRef.current.customerSid !== confirmedCustomerSid) {
      ownerRef.current = { previousSourceSid: callSid, customerSid: confirmedCustomerSid };
      const status = predictiveState.status === "connected" ? "in-progress" : normalizeProviderStatus(predictiveState.status) ?? "in-progress";
      setCustomer({ sid: confirmedCustomerSid, status });
      setLifecycle(previous => {
        const joined = callLifecycleReducer(previous, { type: "CUSTOMER_JOINED", customerSid: confirmedCustomerSid });
        return isTerminalForOutcome(status) ? callLifecycleReducer(joined, { type: "PROVIDER_ENDED", outcome: normalizedToOutcome(status) }) : joined;
      });
      previousFsmRef.current = fsmState;
      if (!isTerminalForOutcome(status) && fsmState !== "connected") {
        if (fsmState !== "dialing") send({ type: "START_DIALING" });
        send({ type: "CONNECT" });
      }
      return;
    }
    if (previousFsmRef.current === fsmState) return;
    recordFlashBreadcrumb("fsm", `${previousFsmRef.current} -> ${fsmState}`);
    previousFsmRef.current = fsmState;

    // A new dial always resets the lifecycle — the reducer starts a fresh
    // generation even from terminal phases. Drop the previous call's
    // provider tracking too, so a stale leg's late events can't repaint the
    // old outcome over the new dial.
    if (fsmState === "dialing") {
      if (lifecycleRef.current.phase === "dialing") return;
      resetCustomer(previousSource);
      dispatch({ type: "START_DIALING" });
      return;
    }

    // FSM returning to idle (the NEXT action after a finished call) clears
    // the lifecycle too — the reducer ignores RESET mid-call, so this only
    // wipes terminal outcomes, never a live dial.
    if (fsmState === "idle") {
      recoveryRetired.current = true;
      resetCustomer(callSid);
      dispatch({ type: "RESET" });
      return;
    }

    const currentPhase = lifecycleRef.current.phase;
    if (TERMINAL_PHASES.has(currentPhase)) return;

    switch (fsmState) {
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
  }, [fsmState, callSid, resetCustomer, confirmedCustomerSid, predictiveState.status, send]);

  const displayState = getCallDisplayState({ lifecycle, providerStatus, isPredictive, predictiveState, fsmState, recentAttemptDisposition });

  const displayColor =
    displayState === "failed"
      ? "var(--primary)"
      : displayState === "connected" || displayState === "dialing"
        ? "var(--success)"
      : "var(--muted-foreground)";

  const terminalCallSid =
    providerStatus && isTerminalForOutcome(providerStatus) ? customerLegSid : null;

  const isCurrentCustomer = useCallback(() => ownerRef.current === owner, [owner]);

  const confirmCustomerEnded = useCallback(() => {
    if (!isCurrentCustomer()) return false;
    recoveryRetired.current = true;
    setLifecycle(previous => callLifecycleReducer(previous, { type: "HANG_UP" }));
    send({ type: "HANG_UP" });
    return true;
  }, [isCurrentCustomer, send]);

  return {
    displayState,
    displayColor,
    beginDial,
    terminalCallSid,
    customerCallSid: customerLegSid,
    recoveredManual,
    retireManualRecovery,
    isCurrentCustomer,
    confirmCustomerEnded,
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
