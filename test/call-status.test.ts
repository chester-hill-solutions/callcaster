import { describe, expect, test } from "vitest";

import {
  getStateMachineAction,
  isActiveStatus,
  isTerminalStatus,
  normalizeProviderStatus,
} from "../app/lib/call-status";

describe("call-status", () => {
  test("normalizeProviderStatus returns null for null/empty/unknown and normalizes case", () => {
    expect(normalizeProviderStatus(null)).toBeNull();
    expect(normalizeProviderStatus(undefined)).toBeNull();
    expect(normalizeProviderStatus("")).toBeNull();
    expect(normalizeProviderStatus("NOT-A-STATUS")).toBeNull();
    expect(normalizeProviderStatus("IN-PROGRESS")).toBe("in-progress");
    expect(normalizeProviderStatus("queued")).toBe("queued");
  });

  test("getStateMachineAction maps statuses", () => {
    expect(getStateMachineAction(null)).toBeNull();
    expect(getStateMachineAction("in-progress")).toBe("CONNECT");
    expect(getStateMachineAction("completed")).toBe("HANG_UP");
    expect(getStateMachineAction("canceled")).toBe("HANG_UP");
    expect(getStateMachineAction("failed")).toBe("FAIL");
    expect(getStateMachineAction("no-answer")).toBe("FAIL");
    expect(getStateMachineAction("busy")).toBe("FAIL");
    expect(getStateMachineAction("ringing")).toBeNull();
  });

  test("isTerminalStatus and isActiveStatus classify statuses", () => {
    expect(isTerminalStatus(null)).toBe(false);
    expect(isTerminalStatus("completed")).toBe(true);
    expect(isTerminalStatus("busy")).toBe(true);
    expect(isTerminalStatus("in-progress")).toBe(false);

    expect(isActiveStatus(null)).toBe(false);
    expect(isActiveStatus("queued")).toBe(true);
    expect(isActiveStatus("ringing")).toBe(true);
    expect(isActiveStatus("initiated")).toBe(true);
    expect(isActiveStatus("in-progress")).toBe(true);
    expect(isActiveStatus("completed")).toBe(false);
  });
});

