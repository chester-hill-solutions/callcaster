import { describe, expect, test } from "vitest";
import {
  DEFAULT_MEDIA_STREAM_MAX_PER_WORKSPACE,
  parseMediaStreamMaxPerWorkspace,
  WorkspaceStreamCapTracker,
} from "../services/media-stream/workspace-stream-cap";

describe("parseMediaStreamMaxPerWorkspace", () => {
  test("defaults to 10 when unset or empty", () => {
    expect(parseMediaStreamMaxPerWorkspace(undefined)).toBe(
      DEFAULT_MEDIA_STREAM_MAX_PER_WORKSPACE,
    );
    expect(parseMediaStreamMaxPerWorkspace("")).toBe(
      DEFAULT_MEDIA_STREAM_MAX_PER_WORKSPACE,
    );
    expect(parseMediaStreamMaxPerWorkspace("   ")).toBe(
      DEFAULT_MEDIA_STREAM_MAX_PER_WORKSPACE,
    );
  });

  test("parses a positive integer", () => {
    expect(parseMediaStreamMaxPerWorkspace("25")).toBe(25);
  });

  test("rejects non-positive values", () => {
    expect(() => parseMediaStreamMaxPerWorkspace("0")).toThrow(
      /positive integer/,
    );
    expect(() => parseMediaStreamMaxPerWorkspace("-3")).toThrow(/positive integer/);
    expect(() => parseMediaStreamMaxPerWorkspace("abc")).toThrow(/positive integer/);
  });
});

describe("WorkspaceStreamCapTracker", () => {
  test("allows up to max concurrent streams per workspace", () => {
    const tracker = new WorkspaceStreamCapTracker(2);

    expect(tracker.tryAcquire("ws-1")).toBe(true);
    expect(tracker.getCount("ws-1")).toBe(1);
    expect(tracker.tryAcquire("ws-1")).toBe(true);
    expect(tracker.getCount("ws-1")).toBe(2);
    expect(tracker.tryAcquire("ws-1")).toBe(false);
    expect(tracker.getCount("ws-1")).toBe(2);
  });

  test("tracks workspaces independently", () => {
    const tracker = new WorkspaceStreamCapTracker(1);

    expect(tracker.tryAcquire("ws-1")).toBe(true);
    expect(tracker.tryAcquire("ws-2")).toBe(true);
    expect(tracker.tryAcquire("ws-1")).toBe(false);
    expect(tracker.tryAcquire("ws-2")).toBe(false);
    expect(tracker.activeWorkspaceCount()).toBe(2);
    expect(tracker.totalActive()).toBe(2);
  });

  test("release frees a slot for the same workspace", () => {
    const tracker = new WorkspaceStreamCapTracker(1);

    expect(tracker.tryAcquire("ws-1")).toBe(true);
    expect(tracker.tryAcquire("ws-1")).toBe(false);

    tracker.release("ws-1");
    expect(tracker.getCount("ws-1")).toBe(0);
    expect(tracker.tryAcquire("ws-1")).toBe(true);
  });

  test("release is a no-op when count is already zero", () => {
    const tracker = new WorkspaceStreamCapTracker(1);
    tracker.release("ws-missing");
    expect(tracker.getCount("ws-missing")).toBe(0);
  });

  test("removes workspace entry when last connection is released", () => {
    const tracker = new WorkspaceStreamCapTracker(2);
    tracker.tryAcquire("ws-1");
    tracker.release("ws-1");
    expect(tracker.activeWorkspaceCount()).toBe(0);
    expect(tracker.totalActive()).toBe(0);
  });
});
