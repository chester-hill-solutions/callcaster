import { useEffect, useRef } from "react";

/** Display states that mean the call is over, whichever side ended it. */
export const TERMINAL_DISPLAY_STATES: ReadonlySet<string> = new Set([
  "completed",
  "failed",
  "no-answer",
  "voicemail",
]);

/**
 * When the contact hangs up first, the provider marks the customer leg
 * terminal and the status strip reads "Call Completed" while the agent's
 * own SDK leg can linger connected — Hang Up stays on screen and only
 * cycles its confirmation (#1292). Tear the agent leg down the moment
 * the display goes terminal so `callState` converges and the Dial button
 * comes back.
 *
 * Edge-triggered on purpose: `displayState` can already read "completed"
 * from the previous attempt when an inbound call is answered on the
 * campaign screen, and that call must not be dropped. Predictive mode is
 * excluded because the agent leg stays in the conference between calls.
 */
export function useRemoteHangupReconcile({
  displayState,
  callState,
  isPredictive,
  hangUp,
}: {
  displayState: string;
  callState: string;
  isPredictive: boolean;
  hangUp: () => Promise<void>;
}) {
  const prevDisplayStateRef = useRef(displayState);

  /**
   * @effect Hang up the lingering agent leg when the display state newly
   * enters a terminal value while the SDK still reports the call live.
   * @effect-deps displayState, callState, isPredictive, hangUp — re-evaluates
   * on every state change; the previous-display ref makes it fire only on
   * the transition into a terminal state.
   * @effect-side-effects network (hangUp → /api/hangup + SDK disconnect),
   * once per transition; nothing to clean up.
   * @effect-why-not-loader Reconciles two live client-side call states;
   * there is no data to load.
   */
  useEffect(() => {
    const prev = prevDisplayStateRef.current;
    prevDisplayStateRef.current = displayState;
    if (isPredictive) return;
    if (!TERMINAL_DISPLAY_STATES.has(displayState)) return;
    if (TERMINAL_DISPLAY_STATES.has(prev)) return;
    if (callState !== "connected" && callState !== "dialing") return;
    hangUp().catch(() => {
      // hangUp already converges callState when the SDK leg is gone.
    });
  }, [displayState, callState, isPredictive, hangUp]);
}
