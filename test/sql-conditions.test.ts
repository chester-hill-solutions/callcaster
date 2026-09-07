import { eq, sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { andAll, andConditions, orConditions, requireConditions } from "@/lib/sql-conditions";
import { weekdayKey, WEEKDAY_KEYS } from "@/lib/schedule-intervals";

// Roadmap E6.3: one invariant, one failure policy.
describe("sql-conditions", () => {
  test("an empty list fails loudly with the caller's context", () => {
    expect(() => requireConditions([], "call log")).toThrow("call log requires at least one SQL condition");
    expect(() => andConditions([], "queue search")).toThrow(/queue search/);
    expect(() => orConditions([], "queue search")).toThrow(/queue search/);
  });

  test("a non-empty list joins", () => {
    const a = eq(sql`x`, 1);
    const b = eq(sql`y`, 2);
    expect(andAll(requireConditions([a, b], "t"))).toBeDefined();
    expect(andConditions([a], "t")).toBeDefined();
    expect(orConditions([a, b], "t")).toBeDefined();
  });
});

describe("weekdayKey", () => {
  test("is total over getUTCDay values and wraps any integer", () => {
    expect(WEEKDAY_KEYS.map((_, i) => weekdayKey(i))).toEqual([...WEEKDAY_KEYS]);
    expect(weekdayKey(7)).toBe("sunday");
    expect(weekdayKey(-1)).toBe("saturday");
    expect(weekdayKey(13)).toBe("saturday");
  });
});
