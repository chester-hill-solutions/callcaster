import { describe, expect, test } from "vitest";
import { householdKeyFor } from "../app/lib/household-key";

describe("householdKeyFor (TS unit)", () => {
  test("normalizes mixed case and punctuation", () => {
    expect(householdKeyFor("123 Main St., Apt #4", "M5V 2T6")).toBe(
      "123 main st apt 4|m5v2t6",
    );
  });

  test("same key regardless of formatting", () => {
    const a = householdKeyFor("123 Main St., Apt #4", "M5V 2T6");
    const b = householdKeyFor("123  MAIN st apt 4", "m5v2t6");
    expect(a).toBe(b);
    expect(a).not.toBeNull();
  });

  test("postal keeps only alphanumerics", () => {
    expect(householdKeyFor("1 A St", "M5V-2T6")).toBe("1 a st|m5v2t6");
    expect(householdKeyFor("1 A St", "90210")).toBe("1 a st|90210");
  });

  test("unicode accents become spaces (then collapse)", () => {
    // é is outside [a-z0-9], so it turns into a space like any punctuation.
    expect(householdKeyFor("Élysée Blvd", "90210")).toBe("lys e blvd|90210");
  });

  test("null unless both parts are non-empty after normalization", () => {
    expect(householdKeyFor(null, null)).toBeNull();
    expect(householdKeyFor(undefined, undefined)).toBeNull();
    expect(householdKeyFor("", "M5V 2T6")).toBeNull();
    expect(householdKeyFor("123 Main St", "")).toBeNull();
    expect(householdKeyFor("   ", "M5V 2T6")).toBeNull();
    expect(householdKeyFor("!!!---", "M5V 2T6")).toBeNull();
    expect(householdKeyFor("123 Main St", " -- ")).toBeNull();
    expect(householdKeyFor(null, "M5V 2T6")).toBeNull();
    expect(householdKeyFor("123 Main St", null)).toBeNull();
  });

  test("whitespace runs collapse to single spaces and edges trim", () => {
    expect(householdKeyFor("  42   Oak\tAve  ", "K1A0B1")).toBe("42 oak ave|k1a0b1");
  });
});
