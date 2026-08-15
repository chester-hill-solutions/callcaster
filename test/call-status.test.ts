import { describe, expect, test } from "vitest";

import {
  getStateMachineAction,
  isActiveStatus,
  isTerminalStatus,
  normalizeProviderStatus,
  toDialerStatus,
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

  test("normalizeProviderStatus trims whitespace and maps snake_case provider variants", () => {
    expect(normalizeProviderStatus("in-progress")).toBe("in-progress");
    expect(normalizeProviderStatus("in_progress")).toBe("in-progress");
    expect(normalizeProviderStatus("no_answer")).toBe("no-answer");
    expect(normalizeProviderStatus("COMPLETED")).toBe("completed");
    expect(normalizeProviderStatus("weird")).toBeNull();
    expect(normalizeProviderStatus("  queued  ")).toBe("queued");
    expect(normalizeProviderStatus(" IN_PROGRESS ")).toBe("in-progress");
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

  test("toDialerStatus maps raw provider statuses to the dialer vocabulary", () => {
    expect(toDialerStatus("initiated")).toBe("dialing");
    expect(toDialerStatus("queued")).toBe("dialing");
    expect(toDialerStatus("ringing")).toBe("dialing");
    expect(toDialerStatus("in-progress")).toBe("connected");
    expect(toDialerStatus("IN-PROGRESS")).toBe("connected");
    expect(toDialerStatus("completed")).toBe("completed");
    expect(toDialerStatus("canceled")).toBe("completed");
    expect(toDialerStatus("busy")).toBe("failed");
    expect(toDialerStatus("failed")).toBe("failed");
    expect(toDialerStatus("no-answer")).toBe("no-answer");
  });

  test("toDialerStatus passes dialer vocabulary and unknown values through", () => {
    expect(toDialerStatus("idle")).toBe("idle");
    expect(toDialerStatus("dialing")).toBe("dialing");
    expect(toDialerStatus("connected")).toBe("connected");
    expect(toDialerStatus("")).toBe("");
    expect(toDialerStatus("voicemail")).toBe("voicemail");
  });
});

