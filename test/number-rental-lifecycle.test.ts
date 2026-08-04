import { describe, expect, test } from "vitest";

import {
  canSpendFromNumber,
  rentalActionForUnpaidCycles,
} from "@/lib/number-rental-lifecycle";

describe("rentalActionForUnpaidCycles", () => {
  test.each([
    [0, "none"],
    [1, "warn"],
    [2, "suspend"],
    [3, "release"],
  ] as const)("%i unpaid cycle(s) on an already-suspended number -> %s", (cycles, expected) => {
    expect(rentalActionForUnpaidCycles(cycles, { alreadySuspended: true })).toBe(expected);
  });

  // A number that skipped runs (worker down, cron missed) must land on the
  // correct rung rather than resuming one behind, and must not sit forever at
  // four or five unpaid cycles without ever being released.
  test.each([4, 5, 12])("%i unpaid cycles still releases once suspended", (cycles) => {
    expect(rentalActionForUnpaidCycles(cycles, { alreadySuspended: true })).toBe("release");
  });

  // Release is the only irreversible rung, and a count alone cannot tell you
  // whether the customer was ever warned. A backlog — the ladder meeting a
  // number that predates it, or a long worker outage — otherwise takes the
  // number away with no notice at all. Suspending first costs one more cycle
  // and makes the warning real.
  test.each([3, 4, 12])(
    "%i unpaid cycles suspends rather than releases when never suspended",
    (cycles) => {
      expect(rentalActionForUnpaidCycles(cycles, { alreadySuspended: false })).toBe("suspend");
    },
  );

  test("defaults to not-yet-suspended, so an omitted flag cannot release", () => {
    expect(rentalActionForUnpaidCycles(5)).toBe("suspend");
  });

  test("the lower rungs do not depend on suspension state", () => {
    expect(rentalActionForUnpaidCycles(1, { alreadySuspended: false })).toBe("warn");
    expect(rentalActionForUnpaidCycles(2, { alreadySuspended: false })).toBe("suspend");
  });

  test("a negative count is treated as nothing owed, not as an escalation", () => {
    expect(rentalActionForUnpaidCycles(-1)).toBe("none");
  });
});

describe("canSpendFromNumber", () => {
  test("a healthy number can spend", () => {
    expect(canSpendFromNumber({})).toBe(true);
    expect(canSpendFromNumber({ suspended_at: null })).toBe(true);
  });

  test("a suspended number cannot spend", () => {
    expect(canSpendFromNumber({ suspended_at: "2026-07-31T00:00:00Z" })).toBe(false);
  });
});
