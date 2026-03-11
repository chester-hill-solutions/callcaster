import { describe, expect, test } from "vitest";

import { formatErrorForUser, getErrorMessage, isErrorResponse } from "@/lib/errors.client";

describe("errors.client", () => {
  test("isErrorResponse detects standard error shape", () => {
    expect(isErrorResponse({ error: "x" })).toBe(true);
    expect(isErrorResponse({ error: 123 })).toBe(false);
    expect(isErrorResponse(null)).toBe(false);
    expect(isErrorResponse("x")).toBe(false);
  });

  test("getErrorMessage handles ClientError, Error, string, and unknown", () => {
    expect(getErrorMessage({ error: "e", message: "m" })).toBe("m");
    expect(getErrorMessage({ error: "e" })).toBe("e");
    expect(getErrorMessage({ error: "" })).toBe("An error occurred");
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
    expect(getErrorMessage("s")).toBe("s");
    expect(getErrorMessage({})).toBe("An unexpected error occurred");
  });

  test("formatErrorForUser hides connection errors", () => {
    expect(formatErrorForUser({ error: "x", message: "ENOENT something" })).toBe(
      "A connection error occurred. Please try again.",
    );
    expect(formatErrorForUser({ error: "x", message: "ECONNREFUSED something" })).toBe(
      "A connection error occurred. Please try again.",
    );
    expect(formatErrorForUser({ error: "x", message: "other" })).toBe("other");
  });
});

