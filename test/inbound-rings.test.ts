import { describe, expect, it } from "vitest";

import {
  inboundRingCountToDialTimeoutSeconds,
  normalizeInboundRingCount,
} from "../shared/inbound-rings";

describe("inbound ring helpers", () => {
  it("normalizes invalid values to the default", () => {
    expect(normalizeInboundRingCount(undefined)).toBe(4);
    expect(normalizeInboundRingCount("abc")).toBe(4);
    expect(normalizeInboundRingCount(0)).toBe(1);
    expect(normalizeInboundRingCount(99)).toBe(10);
  });

  it("maps ring counts to dial timeout seconds", () => {
    expect(inboundRingCountToDialTimeoutSeconds(3)).toBe(15);
    expect(inboundRingCountToDialTimeoutSeconds(6)).toBe(30);
  });
});
