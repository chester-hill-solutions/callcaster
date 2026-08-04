/**
 * What to do about a rented number that has not been paid for.
 *
 * Policy set by the product owner on 2026-07-31: one unpaid cycle warns, the
 * next suspends, the next releases.
 *
 * Pure and shared so the decision can be tested exhaustively without a
 * database, a Twilio client, or a clock — and so the escalation ladder is
 * stated in exactly one place rather than inferred from nested conditionals in
 * the billing loop.
 */

export type RentalLifecycleAction = "none" | "warn" | "suspend" | "release";

/** Unpaid cycles at which each step fires. */
export const RENTAL_WARN_AFTER_CYCLES = 1;
export const RENTAL_SUSPEND_AFTER_CYCLES = 2;
export const RENTAL_RELEASE_AFTER_CYCLES = 3;

/**
 * Decide the action for a number with `unpaidCycles` unpaid billing cycles.
 *
 * Escalation is by count, not by "the step after the last one", so a number
 * that skipped a run — the worker was down, the cron was missed — still lands
 * on the correct rung rather than resuming one behind.
 *
 * `alreadySuspended` is the one piece of history the count cannot supply, and
 * it guards the only irreversible rung. Releasing a number that was never
 * suspended would take it away from a customer who received no warning and no
 * suspension notice — which is exactly what a backlog of unpaid cycles produces
 * the first time this ladder runs against pre-existing numbers. Such a number
 * suspends instead, and releases on a later run once the suspension is real.
 */
export function rentalActionForUnpaidCycles(
  unpaidCycles: number,
  options: { alreadySuspended?: boolean } = {},
): RentalLifecycleAction {
  if (unpaidCycles >= RENTAL_RELEASE_AFTER_CYCLES) {
    return options.alreadySuspended ? "release" : "suspend";
  }
  if (unpaidCycles === RENTAL_SUSPEND_AFTER_CYCLES) return "suspend";
  if (unpaidCycles === RENTAL_WARN_AFTER_CYCLES) return "warn";
  return "none";
}

/**
 * True when a number may still be used to spend money — as a campaign caller
 * ID, or to send.
 *
 * Suspension deliberately does NOT stop inbound: a customer behind on payment
 * should still receive calls to their number while they sort it out. What it
 * stops is incurring further cost.
 *
 * There is no released state to check: releasing deletes the row.
 */
export function canSpendFromNumber(number: {
  suspended_at?: string | Date | null;
}): boolean {
  return !number.suspended_at;
}
