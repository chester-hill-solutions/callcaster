/**
 * In-flight claim marker for the campaign queue (#2208).
 *
 * Splitting a campaign while an SMS is in flight used to double-send the
 * contact. The row stays `queued` until AFTER the provider call returns —
 * that ordering is deliberate crash-safety, so a process death after Twilio
 * accepted the message still leaves a queued row to retry rather than silently
 * dropping the send (see `campaign-sms-send.server.ts`). The consequence is
 * that an in-flight row is indistinguishable from an untouched one, and a
 * split would copy it into a new segment while the original send completed.
 *
 * So the SMS path marks the row `claimed_at` BEFORE calling the provider. The
 * marker is deliberately separate from `queue_state`: it records "a dispatcher
 * has this row in hand", not "this row has been worked". Moving the dequeue
 * earlier would have fixed the double-send and broken the crash-safety, which
 * is why this is a marker and not a state change.
 *
 * The claim is taken with a single conditional UPDATE, which is atomic in
 * Postgres: two dispatchers racing for the same row cannot both win, and the
 * loser sees zero rows updated rather than needing a second round-trip to
 * discover the conflict.
 */

/**
 * How long a claim may stand before another dispatcher may take the row. A
 * dispatcher that dies mid-send must not hold the row back forever, so the
 * claim is a lease, not a lock. This mirrors the 10-minute window the
 * existing `reset_stale_campaign_queue_claims` uses for the manual-dial path.
 */
export const SMS_CLAIM_LEASE_MS = 10 * 60 * 1000;

/**
 * A claim is live when it was taken less than one lease ago.
 *
 * `claimed_at` is a real `timestamptz` and the Drizzle model says so (#2213),
 * so every caller hands back a `Date`. This signature used to accept a string
 * as well, on the claim that raw-`sql` projections and RPC payloads would
 * arrive as Postgres-formatted text. **They do not** — narrowing it to `Date`
 * produces no compile error anywhere in `app/`, `test/`, `e2e/`, `shared/`,
 * `server/` or `worker/`, so the string arm, the `Date.parse` fallback and the
 * `Number.isNaN` guard were all unreachable. They are gone, and with them a
 * `Date | string` in the signature that made it look as though two timestamp
 * formats were genuinely in play.
 */
export function claimIsLive(
  claimedAt: Date | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!claimedAt) return false;
  return now - claimedAt.getTime() < SMS_CLAIM_LEASE_MS;
}
