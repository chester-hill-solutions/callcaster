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
 */
describe("claimIsLive (#2208)", () => {
  const now = Date.parse("2026-09-30T12:00:00.000Z");

  test("no claim is not live", () => {
    expect(claimIsLive(null, now)).toBe(false);
    expect(claimIsLive(undefined, now)).toBe(false);
    expect(claimIsLive("", now)).toBe(false);
  });

  test("a claim taken seconds ago is live", () => {
    const claimedAt = new Date(now - 5_000).toISOString();
    expect(claimIsLive(claimedAt, now)).toBe(true);
  });

  test("a claim older than the lease is not live", () => {
    const claimedAt = new Date(now - SMS_CLAIM_LEASE_MS - 1_000).toISOString();
    expect(claimIsLive(claimedAt, now)).toBe(false);
  });

  test("a claim exactly at the lease boundary is not live", () => {
    // Boundary pinned deliberately: at the boundary another dispatcher may
    // take the row, so the predicate must already say no.
    const claimedAt = new Date(now - SMS_CLAIM_LEASE_MS).toISOString();
    expect(claimIsLive(claimedAt, now)).toBe(false);
  });

  // An unparseable timestamp must not read as "live forever". If it did, one
  // corrupt row would be excluded from every future split with no way to clear
  // it short of a manual UPDATE.
  test("an unparseable claim is not live", () => {
    expect(claimIsLive("not-a-timestamp", now)).toBe(false);
    expect(claimIsLive("2026-13-45T99:99:99Z", now)).toBe(false);
  });

  // `claimed_at` is `text()` in the Drizzle schema but `timestamptz` in the
  // database (#2213), so the driver hands back a Date. A string-only signature
  // gets `Date.parse(Date)` === NaN, reads every claim as expired, and the
  // whole guard becomes decorative. This case is the reason the signature is
  // `string | Date`, and it was added because the integration test caught the
  // guard silently doing nothing.
  test("a Date-valued claim is live — the column really is timestamptz", () => {
    expect(claimIsLive(new Date(now - 5_000), now)).toBe(true);
  });

  test("an expired Date-valued claim is not live", () => {
    expect(
      claimIsLive(new Date(now - SMS_CLAIM_LEASE_MS - 1_000), now),
    ).toBe(false);
  });
});
