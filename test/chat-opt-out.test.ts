import { describe, expect, test } from "vitest";

import {
  isOptOutMessage,
  parseOptOutKeywords,
} from "../app/lib/chat-opt-out";

describe("chat opt-out helpers", () => {
  test("parses configured keywords into normalized unique values", () => {
    expect(parseOptOutKeywords("STOP, unsubscribe, stop")).toEqual([
      "STOP",
      "UNSUBSCRIBE",
    ]);
  });

  test("falls back to default opt-out keywords when none are configured", () => {
    expect(parseOptOutKeywords("")).toEqual(["STOP", "UNSUBSCRIBE"]);
  });

  test("matches opt-out messages case-insensitively after trimming", () => {
    expect(isOptOutMessage(" stop ", ["STOP"])).toBe(true);
    expect(isOptOutMessage("No thanks", ["STOP"])).toBe(false);
  });
});
