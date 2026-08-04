import { describe, expect, test } from "vitest";

import {
  hasInsufficientCreditsForOutbound,
  OUTBOUND_CREDIT_FLOOR,
} from "../shared/credit-floor";

describe("credit-floor", () => {
  test("OUTBOUND_CREDIT_FLOOR is zero (hard stop, no grace)", () => {
    expect(OUTBOUND_CREDIT_FLOOR).toBe(0);
  });

  test("hasInsufficientCreditsForOutbound blocks at and below floor", () => {
    expect(hasInsufficientCreditsForOutbound(0)).toBe(true);
    expect(hasInsufficientCreditsForOutbound(-5)).toBe(true);
    expect(hasInsufficientCreditsForOutbound(1)).toBe(false);
  });

  test("hasInsufficientCreditsForOutbound treats null as insufficient", () => {
    expect(hasInsufficientCreditsForOutbound(null)).toBe(true);
  });
});
