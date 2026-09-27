import { describe, expect, test } from "vitest";

import {
  bucketFromIdempotencyKey,
  manualCreditLoadKey,
  welcomeCreditsKey,
} from "../shared/billing-keys";

describe("manualCreditLoadKey", () => {
  test("embeds the workspace and nonce in the documented namespace", () => {
    expect(manualCreditLoadKey("ws-1", "nonce-abc")).toBe(
      "manual-credit:ws-1:nonce-abc",
    );
  });

  test("a different nonce produces a different key (per-form idempotency)", () => {
    expect(manualCreditLoadKey("ws-1", "nonce-a")).not.toBe(
      manualCreditLoadKey("ws-1", "nonce-b"),
    );
  });

  test("a different workspace produces a different key", () => {
    expect(manualCreditLoadKey("ws-1", "nonce-a")).not.toBe(
      manualCreditLoadKey("ws-2", "nonce-a"),
    );
  });

  test("classifies as a non-SMS/voice/ai grant, like welcome credits", () => {
    const key = manualCreditLoadKey("ws-1", "nonce-a");
    expect(bucketFromIdempotencyKey(key)).toBe("other");
    expect(bucketFromIdempotencyKey(welcomeCreditsKey("ws-1"))).toBe("other");
  });
});