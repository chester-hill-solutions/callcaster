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
 * so a row read through the model hands back a `Date`. The `string` arm is for
 * the callers that do not go through the model — a raw `sql` projection, or an
 * RPC payload — and those arrive as a Postgres-formatted timestamp such as
 * `"2026-09-30 14:10:47.898535+00"`, which `Date.parse` handles.
 *
 * An earlier revision of this function was string-only, with a long note
 * explaining that a `Date` branch would be unreachable because the column was
 * mis-declared as `text()`. That drift is fixed, so the `Date` branch is now
 * the common path rather than dead code, and the string arm is the fallback
 * instead of the only case.
 */
export function claimIsLive(
  claimedAt: Date | string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!claimedAt) return false;
  const claimedMs =
    claimedAt instanceof Date ? claimedAt.getTime() : Date.parse(claimedAt);
  if (Number.isNaN(claimedMs)) return false;
  return now - claimedMs < SMS_CLAIM_LEASE_MS;
}
