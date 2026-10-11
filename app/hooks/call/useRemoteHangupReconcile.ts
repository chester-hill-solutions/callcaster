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
 * campaign screen, and that call must not be dropped. We also watch the
 * current contact's terminal provider event so an older completed label
 * cannot hide the current call's end. Predictive mode is excluded because
 * the agent leg stays in the conference between calls.
 */
export function useRemoteHangupReconcile({
  displayState,
  callState,
  isPredictive,
  terminalCallSid,
  hangUp,
}: {
  displayState: string;
  callState: string;
  isPredictive: boolean;
  terminalCallSid: string | null;
  hangUp: () => Promise<void>;
}) {
  const prevDisplayStateRef = useRef(displayState);
  const handledTerminalCallSidRef = useRef<string | null>(null);

  /**
   * @effect Hang up the lingering agent leg when the display state newly
   * enters a terminal value or the current call gets a terminal provider
   * status while the SDK still reports the call live.
   * @effect-deps displayState, callState, isPredictive, terminalCallSid,
   * hangUp — re-evaluates on every state change; refs make each display-state
   * or current-call terminal transition fire only once.
   * @effect-side-effects network (hangUp → /api/hangup + SDK disconnect),
   * once per transition; nothing to clean up.
   * @effect-why-not-loader Reconciles two live client-side call states;
   * there is no data to load.
   */
  useEffect(() => {
    const prev = prevDisplayStateRef.current;
    prevDisplayStateRef.current = displayState;
    if (isPredictive) return;

    // A previous attempt can already make the display read "Call Completed"
    // before the current call's provider event arrives. In that case the
    // display-state edge below does not fire. Use the current call SID as the
    // event edge so the still-live agent leg is always released.
    if (
      terminalCallSid &&
      handledTerminalCallSidRef.current !== terminalCallSid
    ) {
      if (callState === "connected" || callState === "dialing") {
        handledTerminalCallSidRef.current = terminalCallSid;
        hangUp().catch(() => {
          // hangUp already converges callState when the SDK leg is gone.
        });
        return;
      }
    }

    if (!TERMINAL_DISPLAY_STATES.has(displayState)) return;
    if (TERMINAL_DISPLAY_STATES.has(prev)) return;
    if (callState !== "connected" && callState !== "dialing") return;
    hangUp().catch(() => {
      // hangUp already converges callState when the SDK leg is gone.
    });
  }, [displayState, callState, isPredictive, terminalCallSid, hangUp]);
}
