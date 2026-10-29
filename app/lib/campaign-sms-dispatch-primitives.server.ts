/**
 * Per-dispatch credit reservations for campaign SMS sending.
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
