import { useEffect } from "react";

type UseDialFailureRecoveryOptions = {
  fetcherState: string;
  fetcherData: { error?: string; creditsError?: boolean } | undefined;
  send: (action: { type: string }) => void;
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
  /**
   * @effect Dispatch FAIL to the call FSM when a settled dial fetcher
   * carries an error or creditsError, and toast the error message if one was
   * given.
   * @effect-deps fetcherState, fetcherData, send, showError (fires once per
   * settled fetcher response carrying a rejection)
   * @effect-side-effects none directly (FSM dispatch + toast)
   * @effect-why-not-loader Reacts to a mutation result to fix client FSM
   * state; not request/response data for render.
   */
  useEffect(() => {
    if (fetcherState !== "idle" || !fetcherData) return;
    const { error, creditsError } = fetcherData;
    if (error || creditsError) {
      send({ type: "FAIL" });
      if (error) showError(error);
    }
  }, [fetcherState, fetcherData, send, showError]);
}
