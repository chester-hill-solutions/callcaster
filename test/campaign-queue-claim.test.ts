import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  SMS_CLAIM_LEASE_MS,
  claimIsLive,
} from "@/lib/campaign-queue-claim";

/**
 * The lease predicate is the only thing standing between "a dispatcher died
 * mid-send" and "this row is held back from every future split". Both failure
 * directions are pinned: a live claim must read as live, and an expired one
 * must read as dead or the marker becomes a permanent block.
 *
 * Every case passes a `Date`, because that is what the column hands back:
 * `claimed_at` is a real `timestamptz` and the model says so (#2213). This file
 * used to hold six tests, four of which existed to cover a `string` arm in the
 * signature — an unparseable-timestamp guard, a Postgres-formatted-timestamp
 * parse, and two ISO-string claims. None of them described anything the driver
 * can return any more, and the guard they propped up made the predicate look
 * like it handled two timestamp formats when it handles one.
 */
describe("claimIsLive (#2208)", () => {
  const now = Date.parse("2026-09-30T12:00:00.000Z");

  test("no claim is not live", () => {
    expect(claimIsLive(null, now)).toBe(false);
    expect(claimIsLive(undefined, now)).toBe(false);
  });

  test("a claim taken seconds ago is live", () => {
    const claimedAt = new Date(now - 5_000);
    expect(claimIsLive(claimedAt, now)).toBe(true);
  });

  test("a claim older than the lease is not live", () => {
    const claimedAt = new Date(now - SMS_CLAIM_LEASE_MS - 1_000);
    expect(claimIsLive(claimedAt, now)).toBe(false);
  });

  test("a claim exactly at the lease boundary is not live", () => {
    // Boundary pinned deliberately: at the boundary another dispatcher may
    // take the row, so the predicate must already say no.
    const claimedAt = new Date(now - SMS_CLAIM_LEASE_MS);
    expect(claimIsLive(claimedAt, now)).toBe(false);
  });
});
