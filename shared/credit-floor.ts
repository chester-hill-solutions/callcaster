/**
 * Outbound credit-floor policy shared by voice/SMS send gates.
 *
 * See docs/credit-floor-policy.md for product semantics (warn vs block).
 */

/** Minimum balance required to start a new outbound call or SMS. */
export const OUTBOUND_CREDIT_FLOOR = 0;

/**
 * Returns true when outbound voice/SMS must be blocked (402 / creditsError).
 * Null balance is treated as unknown workspace — callers should 404 separately.
 */
export function hasInsufficientCreditsForOutbound(balance: number | null): boolean {
  if (balance === null) {
    return true;
  }
  return balance <= OUTBOUND_CREDIT_FLOOR;
}
