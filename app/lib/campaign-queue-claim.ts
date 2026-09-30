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
 * The value is always a string, never a `Date`. `claimed_at` is declared
 * `text()` in the Drizzle schema while the column is really `timestamptz` (the
 * repo-wide drift in #2213), and that mismatch means the driver hands back a
 * Postgres-formatted timestamp — `"2026-09-30 14:10:47.898535+00"`, with a
 * space separator and a bare `+00` offset — which `Date.parse` handles
 * correctly. Verified by reading the value back through `db.select()`.
 *
 * An earlier revision of this function took `string | Date` and carried a
 * `Date` branch, on the belief that the driver returned a `Date` for a
 * timestamptz column. It does not. The branch was unreachable, and it forced
 * an `as string | Date | null | undefined` cast at the one production call
 * site, so removing it deletes a cast as well.
 */
export function claimIsLive(
  claimedAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!claimedAt) return false;
  const claimedMs = Date.parse(claimedAt);
  if (Number.isNaN(claimedMs)) return false;
  return now - claimedMs < SMS_CLAIM_LEASE_MS;
}
