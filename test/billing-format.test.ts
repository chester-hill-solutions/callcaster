import { describe, expect, test } from "vitest";

import {
  CREDIT_PRICE_CAD,
  formatCredits,
  formatCurrency,
  formatUnitPrice,
  MIN_CREDITS,
  MIN_PURCHASE_CAD,
} from "../app/lib/billing-format";

describe("billing-format", () => {
  test("exports pricing constants", () => {
    expect(CREDIT_PRICE_CAD).toBe(0.02);
    expect(MIN_PURCHASE_CAD).toBe(10);
    expect(MIN_CREDITS).toBe(500);
  });

  test("formatCredits uses locale string", () => {
    expect(formatCredits(1000)).toBe("1,000");
  });

  test("formatCurrency formats CAD", () => {
    expect(formatCurrency(1.5)).toMatch(/\$1\.50/);
  });

  test("formatUnitPrice returns fixed label", () => {
    expect(formatUnitPrice()).toBe("$0.02 CAD");
  });
});
