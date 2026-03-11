import { describe, expect, test } from "vitest";
import { isValidPhoneNumber, normalizePhoneNumber, phoneRegex } from "@/lib/utils/phone";

describe("app/lib/utils/phone", () => {
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
});

