import { describe, expect, test } from "vitest";

import { getErrorDetail, toUserMessage } from "../app/lib/user-message";

const FALLBACK = "Something went wrong. Please try again.";

describe("app/lib/user-message.ts", () => {
  describe("toUserMessage", () => {
    test("passes through short, capitalized, human-readable messages", () => {
      expect(toUserMessage(new Error("Campaign name is required"), FALLBACK)).toBe(
        "Campaign name is required",
      );
      expect(toUserMessage("You do not have access to this workspace", FALLBACK)).toBe(
        "You do not have access to this workspace",
      );
    });

    test("returns fallback for technical/internal messages", () => {
      expect(
        toUserMessage(new Error("TypeError: Cannot read properties of undefined"), FALLBACK),
      ).toBe(FALLBACK);
      expect(toUserMessage(new Error("fetch failed"), FALLBACK)).toBe(FALLBACK);
      expect(
        toUserMessage(new Error("PGRST116: The result contains 0 rows"), FALLBACK),
      ).toBe(FALLBACK);
      expect(
        toUserMessage(
          new Error('Duplicate key value violates unique constraint "contact_pkey"'),
          FALLBACK,
        ),
      ).toBe(FALLBACK);
      expect(toUserMessage(new Error("ECONNREFUSED 127.0.0.1:5432"), FALLBACK)).toBe(
        FALLBACK,
      );
      expect(toUserMessage(new Error('Unexpected token { in JSON'), FALLBACK)).toBe(
        FALLBACK,
      );
      expect(toUserMessage(new Error("Supabase client error"), FALLBACK)).toBe(FALLBACK);
    });

    test("returns fallback for lowercase, empty, or overlong messages", () => {
      expect(toUserMessage(new Error("something broke"), FALLBACK)).toBe(FALLBACK);
      expect(toUserMessage(new Error(""), FALLBACK)).toBe(FALLBACK);
      expect(toUserMessage(new Error("A".repeat(200)), FALLBACK)).toBe(FALLBACK);
    });

    test("returns fallback for non-string, non-Error values", () => {
      expect(toUserMessage({ message: "Nice message" }, FALLBACK)).toBe(FALLBACK);
      expect(toUserMessage(null, FALLBACK)).toBe(FALLBACK);
      expect(toUserMessage(undefined, FALLBACK)).toBe(FALLBACK);
      expect(toUserMessage(42, FALLBACK)).toBe(FALLBACK);
    });
  });

  describe("getErrorDetail", () => {
    test("extracts raw message from strings and Errors", () => {
      expect(getErrorDetail("raw detail")).toBe("raw detail");
      expect(getErrorDetail(new Error("ECONNREFUSED"))).toBe("ECONNREFUSED");
    });

    test("serializes other values", () => {
      expect(getErrorDetail({ code: 500 })).toBe('{"code":500}');
      expect(getErrorDetail(undefined)).toBe("undefined");
    });
  });
});
