import { describe, expect, test } from "vitest";

import { isSettledSmsStatus } from "@/lib/sms-status";

/**
 * #2048 — a message campaign is complete only when every message has reached a
 * settled provider state.
 *
 * The settlement set is deliberately NOT the billing set:
 *
 *   billing terminal  = delivered, failed, undelivered  (drives the credit debit)
 *   settlement terminal = delivered, read, canceled, failed, undelivered
 *
 * `read` and `canceled` are real terminal provider states that never trigger a
 * second debit. Using the billing set for completion would block a campaign
 * forever whenever a message settles to `canceled` (STOP cancellation, campaign
 * end-date cancellation).
 *
 * `sent` is NOT settled. It is the intermediate state between `sending` and
 * `delivered`, and a campaign must not claim completion while messages are in it.
 * NULL is NOT settled either: the intent row exists but the provider has not
 * reported a state yet.
 *
 * Source of truth for the provider lifecycle:
 * docs/remediation/critical-review-orchestration-plan-2026-07-12.md:424-431
 */
describe("isSettledSmsStatus (#2048)", () => {
  test.each(["delivered", "read", "canceled", "failed", "undelivered"])(
    "%s counts as settled",
    (status) => {
      expect(isSettledSmsStatus(status as never)).toBe(true);
    },
  );

  test.each([
    "accepted",
    "scheduled",
    "queued",
    "sending",
    "sent",
    "receiving",
    "received",
  ])("%s is not settled", (status) => {
    expect(isSettledSmsStatus(status as never)).toBe(false);
  });

  test("NULL is not settled", () => {
    // A NULL status means the intent row exists but no provider callback has
    // reported a state. The IVR gate already treats NULL call status as
    // unsettled; messages must match or the gate leaks early completions.
    expect(isSettledSmsStatus(null)).toBe(false);
  });

  test("settlement is a superset of the billing-terminal set", () => {
    // Guards against someone narrowing settlement to reuse the billing list
    // and silently reintroducing the never-completing campaign bug.
    const billing = ["delivered", "failed", "undelivered"] as const;
    for (const status of billing) {
      expect(isSettledSmsStatus(status)).toBe(true);
    }
  });

  test("read and canceled are settled even though they are not billable", () => {
    // The exact two states the billing set omits. This is the regression that
    // would hang a campaign forever.
    expect(isSettledSmsStatus("read")).toBe(true);
    expect(isSettledSmsStatus("canceled")).toBe(true);
  });
});
