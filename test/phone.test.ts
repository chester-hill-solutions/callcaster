import { describe, expect, test } from "vitest";
import {
  isValidPhoneNumber,
  normalizePhoneNumber,
  parsePhoneNumber,
  phoneRegex,
} from "@/lib/phone";

describe("app/lib/phone", () => {
  test("phoneRegex matches common NA formats", () => {
    expect(phoneRegex.test("+15555550100")).toBe(true);
    expect(phoneRegex.test("(555) 555-0100")).toBe(true);
    expect(phoneRegex.test("555-555-0100")).toBe(true);
    expect(phoneRegex.test("555.555.0100")).toBe(true);
    expect(phoneRegex.test("bad")).toBe(false);
  });

  test("normalizePhoneNumber throws on empty input", () => {
    // runtime guard covers empty string
    expect(() => normalizePhoneNumber("")).toThrow("Phone number input must be a non-empty string");
  });

  test("normalizePhoneNumber normalizes to +1 and strips punctuation", () => {
    expect(normalizePhoneNumber("(555) 555-0100")).toBe("+15555550100");
    expect(normalizePhoneNumber("5555550100")).toBe("+15555550100");
    expect(normalizePhoneNumber("+15555550100")).toBe("+15555550100");
  });

  test("normalizePhoneNumber removes + when it appears after start", () => {
    expect(normalizePhoneNumber("1+5555550100")).toBe("+15555550100");
  });

  test("normalizePhoneNumber throws on invalid non-NA length", () => {
    expect(() => normalizePhoneNumber("+44 20 7946 0018")).toThrow("Invalid phone number length");
  });

  test("isValidPhoneNumber returns false for non-strings/empty", () => {
    expect(isValidPhoneNumber("")).toBe(false);
    expect(isValidPhoneNumber("bad")).toBe(false);
    expect(isValidPhoneNumber("(555) 555-0100")).toBe(true);
  });

  // Format checklist from #1057 — every common NA entry style normalizes to
  // the same E.164 number.
  test.each([
    "5556667777",
    "15556667777",
    "+15556667777",
    "555 666 7777",
    "1 555 666 7777",
    "+1 555 666 7777",
    "(555) 666-7777",
    "+1 (555) 666-7777",
    "555-666-7777",
    "+1 555-666-7777",
  ])("parsePhoneNumber(%s) → +15556667777", (input) => {
    expect(parsePhoneNumber(input)).toBe("+15556667777");
    expect(normalizePhoneNumber(input)).toBe("+15556667777");
  });

  test("parsePhoneNumber returns '' for null and null for garbage", () => {
    expect(parsePhoneNumber(null)).toBe("");
    expect(parsePhoneNumber("not a number")).toBeNull();
    expect(parsePhoneNumber("555-01")).toBeNull();
  });

  test("rejects 11-digit numbers that are not NANP country code 1 (#1057)", () => {
    // Previously accepted as "+25556667777" — not a dialable number.
    expect(parsePhoneNumber("25556667777")).toBeNull();
    expect(() => normalizePhoneNumber("25556667777")).toThrow();
  });

  test("rejects invalid NANP area codes (#1057)", () => {
    // Area codes never start with 0 or 1.
    expect(parsePhoneNumber("0555550100")).toBeNull();
    expect(parsePhoneNumber("+10555550100")).toBeNull();
    // Exchange-code strictness is deliberately NOT enforced — 555-123-4567
    // style legacy/test data must keep importing.
    expect(parsePhoneNumber("5551234567")).toBe("+15551234567");
  });

  test("still rejects international numbers", () => {
    expect(parsePhoneNumber("+44 20 7946 0018")).toBeNull();
    expect(() => normalizePhoneNumber("+44 20 7946 0018")).toThrow(
      "Invalid phone number length",
    );
  });

  test("expands full-precision spreadsheet scientific notation (#1057)", () => {
    // Excel renders 15556667777 as 1.5556667777E+10 when a CSV round-trips.
    expect(parsePhoneNumber("1.5556667777E+10")).toBe("+15556667777");
    expect(parsePhoneNumber("1.5556667777e10")).toBe("+15556667777");
    expect(parsePhoneNumber("5.556667777E+9")).toBe("+15556667777");
  });

  test("rejects rounded scientific notation instead of fabricating digits (#1057)", () => {
    // A rounded export lost real digits; expanding it would import a
    // plausible-looking wrong number ending in zeros.
    expect(parsePhoneNumber("1.55567E+10")).toBeNull();
    expect(parsePhoneNumber("1.5E+10")).toBeNull();
  });
});

