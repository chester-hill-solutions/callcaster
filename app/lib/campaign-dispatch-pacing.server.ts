/** Claims the next provider-request slot at the configured start rate. */
export type StartPacer = {
  waitForTurn: () => Promise<void>;
};

/**
 * Serialises provider-request starts at a fixed minimum interval.
 *
 * The interval must be measured between *requests*, not between the dispatch
 * calls that begin a row's preparation. A dispatched row does async work before
 * the provider is called — line-type lookup, duplicate check, opt-out
 * dequeue — and that work differs per row, so a dispatch-stamped clock drifts
 * from the request clock by exactly the per-row difference. Rows then bunch up:
 * a slow row's request can overtake a faster row's that was dispatched after
 * it, and under load the gap collapses to nothing, which is the one situation
 * where the rate limit matters.
 *
 * Callers queue here immediately before issuing their request, so each row
 * claims a slot in the order it actually reaches the provider.
 */
export function createStartPacer(minStartIntervalMs: number): StartPacer {
  let lastRequestAt: number | null = null;
  // Chains the turns so two rows finishing their preparation in the same tick
  // cannot both read the same `lastRequestAt` and pass the gate together.
  let turn: Promise<void> = Promise.resolve();
  return {
    async waitForTurn() {
      const mine = turn.then(async () => {
        if (lastRequestAt !== null) {
          const waitMs = Math.max(0, minStartIntervalMs - (Date.now() - lastRequestAt));
          if (waitMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, waitMs));
          }
        }
        // Stamped here, at the release of the turn: the request follows
        // immediately with no intervening await.
        lastRequestAt = Date.now();
      });
      // Keep the chain usable after a rejected turn so one failed row cannot
      // wedge every later row's pacing.
      turn = mine.then(
        () => undefined,
        () => undefined,
      );
      return mine;
    },
  };
}
