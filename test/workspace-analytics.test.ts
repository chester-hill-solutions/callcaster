import { describe, expect, it } from "vitest";

import {
  aggregateAttemptMetrics,
  buildWorkspaceAnalytics,
  formatAnalyticsDuration,
  isConnectedAttempt,
  parseCallDurationSeconds,
} from "../shared/workspace-analytics";

describe("workspace analytics helpers", () => {
  it("detects connected attempts from answered_at", () => {
    expect(
      isConnectedAttempt({
        id: 1,
        user_id: "u1",
        created_at: "2026-06-01T10:00:00.000Z",
        answered_at: "2026-06-01T10:00:15.000Z",
        ended_at: "2026-06-01T10:02:00.000Z",
        disposition: "completed",
        call: [{ duration: "90", call_duration: 90, status: "completed", end_time: null }],
      }),
    ).toBe(true);
  });

  it("aggregates attempt timing metrics", () => {
    const metrics = aggregateAttemptMetrics({
      id: 2,
      user_id: "u1",
      created_at: "2026-06-01T10:00:00.000Z",
      answered_at: "2026-06-01T10:00:20.000Z",
      ended_at: "2026-06-01T10:03:00.000Z",
      disposition: "completed",
      call: [{ duration: "120", call_duration: 120, status: "completed", end_time: null }],
    });

    expect(metrics.connected).toBe(true);
    expect(metrics.dialingSeconds).toBe(20);
    expect(metrics.connectedSeconds).toBe(120);
    expect(metrics.interfaceSeconds).toBe(180);
  });

  it("builds workspace and per-user summaries", () => {
    const result = buildWorkspaceAnalytics({
      range: {
        from: "2026-06-01T00:00:00.000Z",
        to: "2026-06-07T23:59:59.999Z",
      },
      scopedUserId: null,
      users: [{ id: "u1", label: "Nate" }],
      attempts: [
        {
          id: 1,
          user_id: "u1",
          created_at: "2026-06-01T10:00:00.000Z",
          answered_at: "2026-06-01T10:00:10.000Z",
          ended_at: "2026-06-01T10:01:00.000Z",
          disposition: "completed",
          call: [{ duration: "40", call_duration: 40, status: "completed", end_time: null }],
        },
        {
          id: 2,
          user_id: "u1",
          created_at: "2026-06-01T11:00:00.000Z",
          answered_at: null,
          ended_at: "2026-06-01T11:00:30.000Z",
          disposition: "no-answer",
          call: [],
        },
      ],
    });

    expect(result.summary.totalDials).toBe(2);
    expect(result.summary.totalConnected).toBe(1);
    expect(result.users[0]?.totalDials).toBe(2);
  });

  it("formats durations for display", () => {
    expect(formatAnalyticsDuration(45)).toBe("45s");
    expect(formatAnalyticsDuration(125)).toBe("2m 5s");
    expect(formatAnalyticsDuration(3725)).toBe("1h 2m");
  });

  it("parses call duration fields", () => {
    expect(parseCallDurationSeconds("42", null)).toBe(42);
    expect(parseCallDurationSeconds(null, 33)).toBe(33);
    expect(parseCallDurationSeconds("", 0)).toBe(0);
  });
});
