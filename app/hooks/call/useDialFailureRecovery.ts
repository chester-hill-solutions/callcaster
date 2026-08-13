import { useEffect, useRef } from "react";

type UseDialFailureRecoveryOptions = {
  fetcherState: string;
  fetcherData: { error?: string; creditsError?: boolean } | undefined;
  // Narrowed to just the action this hook ever dispatches (rather than the
  // wider `{ type: string }` + `as unknown as` cast other call-screen hooks
  // use) — useCallState's send is `(action: CallAction) => void`, and a
  // function typed to accept the whole CallAction union is assignable here
  // without a cast under parameter contravariance.
  send: (action: { type: "FAIL" }) => void;
  showError: (message: string) => void;
};

/**
 * Recover the call FSM when the /api/dial submit is rejected (409 claim
 * refusal, 402 credits, 5xx). START_DIALING fires before the POST settles,
 * so a rejected dial otherwise left the status bar stuck on "Dialing…" with
 * nothing to hang up.
 */
export function useDialFailureRecovery({
  fetcherState,
  fetcherData,
  send,
  showError,
}: UseDialFailureRecoveryOptions) {
  // One reaction per settled response: fetcher.data keeps its identity until
  // the next submission settles, while `send`/`showError` are recreated every
  // render — without this latch a single 409 re-toasted once per render for
  // as long as its data stayed current (#1221).
  const handledDataRef = useRef<unknown>(null);

  /**
   * @effect Dispatch FAIL to the call FSM when a settled dial fetcher
   * carries an error or creditsError, and toast the error message if one was
   * given — once per settled response (latched on fetcher data identity).
   * @effect-deps fetcherState, fetcherData, send, showError (fires once per
   * settled fetcher response carrying a rejection)
   * @effect-side-effects none directly (FSM dispatch + toast)
   * @effect-why-not-loader Reacts to a mutation result to fix client FSM
   * state; not request/response data for render.
   */
  useEffect(() => {
    if (fetcherState !== "idle" || !fetcherData) return;
    if (handledDataRef.current === fetcherData) return;
    handledDataRef.current = fetcherData;
    const { error, creditsError } = fetcherData;
    if (error || creditsError) {
      send({ type: "FAIL" });
      if (error) showError(error);
    }
  }, [fetcherState, fetcherData, send, showError]);
}
