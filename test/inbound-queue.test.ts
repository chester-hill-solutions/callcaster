import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/env.server", () => {
  const handler = { get: () => () => "test" };
  return { env: new Proxy({}, handler) };
});

import { makeQueueName, parseQueueIdFromName, buildHoldMusicTwiml, buildAgentBridgeTwiml } from "../shared/acd-utils.ts";

describe("acd-router queue name helpers", () => {
  test("makeQueueName formats correctly", () => {
    expect(makeQueueName(42)).toBe("inbound_q_42");
    expect(makeQueueName(1)).toBe("inbound_q_1");
  });

  test("parseQueueIdFromName extracts id", () => {
    expect(parseQueueIdFromName("inbound_q_42")).toBe(42);
    expect(parseQueueIdFromName("inbound_q_1")).toBe(1);
  });

  test("parseQueueIdFromName returns null for invalid names", () => {
    expect(parseQueueIdFromName("inbound_q_abc")).toBeNull();
    expect(parseQueueIdFromName("inbound_q_")).toBeNull();
    expect(parseQueueIdFromName("other_q_42")).toBeNull();
    expect(parseQueueIdFromName("")).toBeNull();
    expect(parseQueueIdFromName(null as unknown as string)).toBeNull();
  });
});
