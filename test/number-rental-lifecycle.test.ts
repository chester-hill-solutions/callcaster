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
  ] as const)("%i unpaid cycle(s) -> %s", (cycles, expected) => {
    expect(rentalActionForUnpaidCycles(cycles)).toBe(expected);
  });

  // A number that skipped runs (worker down, cron missed) must land on the
  // correct rung rather than resuming one behind, and must not sit forever at
  // four or five unpaid cycles without ever being released.
  test.each([4, 5, 12])("%i unpaid cycles still releases", (cycles) => {
    expect(rentalActionForUnpaidCycles(cycles)).toBe("release");
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
