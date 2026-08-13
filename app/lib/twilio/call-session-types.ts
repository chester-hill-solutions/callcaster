/**
 * Canonical client-side call session phases for Twilio Voice SDK sessions.
 * This models local softphone state — not Twilio Conference participant hold.
 */
export const CALL_SESSION_PHASES = [
  "idle",
  "ringing",
  "dialing",
  "connected",
  "connected_with_held",
  "completed",
  "failed",
] as const;

export type CallSessionPhase = typeof CALL_SESSION_PHASES[number];

/** Operator mic intent passed from call session owner to audio device hooks. */
export type MicCoordinator = {
  isMicMuted: boolean;
  setMicMuted: (muted: boolean) => void;
};

export function deriveCallSessionPhase(
  activeCall: unknown | null,
  incomingCall: unknown | null,
  heldCount: number,
  callState: string,
): CallSessionPhase {
  if (callState === "failed") return "failed";
  if (incomingCall) return "ringing";
  if (callState === "dialing") return "dialing";
  if (activeCall && heldCount > 0) return "connected_with_held";
  if (activeCall || callState === "connected") return "connected";
  if (callState === "completed") return "completed";
  return "idle";
}

// ---------------------------------------------------------------------------
// Canonical call lifecycle: single source of truth for call phase + outcome
// ---------------------------------------------------------------------------

export type CallPhase =
  | "idle"
  | "dialing"
  | "connected"
  | "ending"
  | "ended";

export type CallOutcome =
  | "completed"
  | "canceled"
  | "failed"
  | "busy"
  | "no-answer"
  | "voicemail"
  | null;

export type CallLifecycleEvent =
  | { type: "START_DIALING" }
  | { type: "CONNECT" }
  | { type: "HANG_UP" }
  | { type: "FAIL" }
  | { type: "NEXT" }
  | { type: "PROVIDER_ENDED"; outcome: CallOutcome }
  | { type: "RESET" };

export type CallLifecycleState = {
  phase: CallPhase;
  outcome: CallOutcome;
  generation: number;
  agentSid: string | null;
  customerSid: string | null;
};

const INITIAL_LIFECYCLE: CallLifecycleState = {
  phase: "idle",
  outcome: null,
  generation: 0,
  agentSid: null,
  customerSid: null,
};

const TERMINAL_PHASES = new Set<CallPhase>(["ending", "ended"]);

export function callLifecycleReducer(
  state: CallLifecycleState,
  event: CallLifecycleEvent,
): CallLifecycleState {
  const { phase, outcome } = state;

  // Terminal phases cannot regress on non-terminal events.
  if (TERMINAL_PHASES.has(phase)) {
    switch (event.type) {
      case "START_DIALING":
        return { ...INITIAL_LIFECYCLE, phase: "dialing", generation: state.generation + 1 };
      case "RESET":
        return { ...INITIAL_LIFECYCLE, generation: state.generation + 1 };
      case "PROVIDER_ENDED":
        if (phase === "ending") {
          return { ...state, phase: "ended", outcome: event.outcome };
        }
        return state;
      default:
        return state;
    }
  }

  switch (phase) {
    case "idle":
      if (event.type === "START_DIALING") return { ...state, phase: "dialing" };
      if (event.type === "HANG_UP") return { ...state, phase: "ended", outcome: "canceled" };
      return state;

    case "dialing":
      if (event.type === "CONNECT") return { ...state, phase: "connected" };
      if (event.type === "FAIL") return { ...state, phase: "ended", outcome: "failed" };
      if (event.type === "HANG_UP") return { ...state, phase: "ending", outcome: null };
      if (event.type === "PROVIDER_ENDED") {
        return { ...state, phase: "ended", outcome: event.outcome };
      }
      return state;

    case "connected":
      if (event.type === "HANG_UP") return { ...state, phase: "ending", outcome: null };
      if (event.type === "PROVIDER_ENDED") {
        return { ...state, phase: "ended", outcome: event.outcome };
      }
      if (event.type === "FAIL") return { ...state, phase: "ended", outcome: "failed" };
      return state;

    default:
      return state;
  }
}

/**
 * Create a canonical call lifecycle state manager.
 * Can be used directly or wrapped in a hook.
 */
export function createCallLifecycle(initial?: Partial<CallLifecycleState>) {
  let state: CallLifecycleState = { ...INITIAL_LIFECYCLE, ...initial };

  return {
    getState: () => state,
    dispatch: (event: CallLifecycleEvent) => {
      state = callLifecycleReducer(state, event);
      return state;
    },
    /** True when the phase is a terminal (ending or ended) phase. */
    isTerminal: () => TERMINAL_PHASES.has(state.phase),
    /** True when a call is in progress (dialing or connected). */
    inProgress: () => state.phase === "dialing" || state.phase === "connected",
    /** True when the outcome is a final result (not null). */
    hasOutcome: () => state.outcome != null,
  };
}

export { TERMINAL_PHASES as CALL_TERMINAL_PHASES };
