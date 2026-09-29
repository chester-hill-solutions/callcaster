/**
 * The two pieces of per-dispatch state that campaign SMS dispatch needs but
 * that have no dependency on it: the credit budget and the start pacer. Both
 * are pure and independently testable, and both are used only by
 * `campaign-sms-dispatch.server.ts`.
 */
import { OUTBOUND_CREDIT_FLOOR } from "../../shared/credit-floor";

/**
 * Per-dispatch credit budget. The entry gate reads the balance once, but
 * debits land asynchronously after delivery, so every send in the batch
 * would otherwise pass on the same stale balance. Reservations are made
 * synchronously right before a send starts (no await in between), so
 * concurrent rows in one dispatch call cannot spend the same credits.
 * Cross-worker reservation is #1271.
 */
export function createDispatchCreditBudget(balance: number) {
  let remaining = balance - OUTBOUND_CREDIT_FLOOR;
  let cheapestSeen = Number.POSITIVE_INFINITY;
  return {
    reserve(cost: number): boolean {
      cheapestSeen = Math.min(cheapestSeen, cost);
      if (cost > remaining) return false;
      remaining -= cost;
      return true;
    },
    /** A send that never reached Twilio will not be debited: give the credits back. */
    release(cost: number): void {
      remaining += cost;
    },
    /** True when a row was refused and the balance still cannot cover the cheapest one seen. */
    get exhausted(): boolean {
      return remaining < cheapestSeen;
    },
  };
}

export type DispatchCreditBudget = ReturnType<typeof createDispatchCreditBudget>;

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
