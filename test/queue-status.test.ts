import { describe, expect, test } from "vitest";

import {
  applyQueueStatusFilter,
  buildAssignedQueueUpdate,
  buildDequeuedQueueUpdate,
  buildProviderStatusQueueUpdate,
  buildQueuedQueueUpdate,
  COMPLETED_QUEUE_COUNT_FILTER,
  getAssignedUserId,
  getQueueDisplayLabel,
  getQueueDisplayState,
  getProviderStatus,
  isDequeued,
  isAssignedToUser,
  isQueued,
  isUserAssignment,
  QUEUE_STATUS_DEQUEUED,
  QUEUE_STATUS_QUEUED,
} from "../app/lib/queue-status";

describe("queue-status", () => {
  test("isQueued matches only the queued sentinel", () => {
    expect(isQueued(QUEUE_STATUS_QUEUED)).toBe(true);
    expect(isQueued("queued ")).toBe(false);
    expect(isQueued(null)).toBe(false);
  });

  test("isAssignedToUser matches exact userId", () => {
    expect(isAssignedToUser("u1", "u1")).toBe(true);
    expect(isAssignedToUser("u2", "u1")).toBe(false);
    expect(isAssignedToUser(null, "u1")).toBe(false);
    expect(
      isAssignedToUser(
        { status: "queued", assigned_to_user_id: "u1", dequeued_at: null },
        "u1",
      ),
    ).toBe(true);
  });

  test("isDequeued treats dequeued_at as the durable completion marker", () => {
    expect(isDequeued(QUEUE_STATUS_DEQUEUED, null)).toBe(true);
    expect(isDequeued("completed", "2026-03-10T00:00:00.000Z")).toBe(true);
    expect(isDequeued("ringing", null)).toBe(false);
    expect(isDequeued(null, null)).toBe(false);
  });

  test("completed queue filter matches dequeued status or dequeued_at", () => {
    expect(COMPLETED_QUEUE_COUNT_FILTER).toBe(
      "status.eq.dequeued,dequeued_at.not.is.null",
    );
  });

  test("isUserAssignment identifies UUID-looking strings only", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    expect(isUserAssignment(uuid)).toBe(true);
    expect(isUserAssignment(uuid.toUpperCase())).toBe(true);
    expect(isUserAssignment(QUEUE_STATUS_QUEUED)).toBe(false);
    expect(isUserAssignment("ringing")).toBe(false);
    expect(isUserAssignment("not-a-uuid")).toBe(false);
    expect(isUserAssignment(null)).toBe(false);
  });

  test("display helpers normalize assigned, active, and completed states", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";

    expect(getQueueDisplayState(QUEUE_STATUS_QUEUED, null)).toBe("queued");
    expect(getQueueDisplayState(uuid, null)).toBe("assigned");
    expect(getQueueDisplayState("in-progress", null)).toBe("active");
    expect(getQueueDisplayState("ringing", "2026-03-10T00:00:00.000Z")).toBe("completed");
    expect(
      getQueueDisplayState({
        status: QUEUE_STATUS_QUEUED,
        assigned_to_user_id: "u1",
        provider_status: "ringing",
        dequeued_at: null,
      }),
    ).toBe("active");

    expect(getQueueDisplayLabel(uuid, null)).toBe("assigned");
    expect(getQueueDisplayLabel("in-progress", null)).toBe("in progress");
  });

  test("normalized helpers prefer explicit assignment and provider fields", () => {
    const queueEntry = {
      status: QUEUE_STATUS_QUEUED,
      assigned_to_user_id: "u1",
      provider_status: "in-progress",
      queue_state: "assigned",
      dequeued_at: null,
      dequeued_by: null,
      dequeued_reason: null,
    };

    expect(getAssignedUserId(queueEntry)).toBe("u1");
    expect(getProviderStatus(queueEntry)).toBe("in-progress");
    expect(isQueued(queueEntry)).toBe(false);
    expect(getQueueDisplayLabel(queueEntry)).toBe("in progress");
  });

  test("queue update builders preserve staged semantics", () => {
    expect(buildQueuedQueueUpdate()).toEqual({
      status: "queued",
      dequeued_at: null,
      dequeued_by: null,
      dequeued_reason: null,
    });

    expect(buildAssignedQueueUpdate("user-1")).toEqual({
      status: "user-1",
      dequeued_at: null,
      dequeued_by: null,
      dequeued_reason: null,
    });

    expect(buildProviderStatusQueueUpdate("ringing")).toEqual({
      status: "ringing",
    });

    const dequeued = buildDequeuedQueueUpdate("user-1", "SMS message sent");
    expect(dequeued.status).toBe(QUEUE_STATUS_DEQUEUED);
    expect(dequeued.dequeued_by).toBe("user-1");
    expect(dequeued.dequeued_reason).toBe("SMS message sent");
    expect(dequeued.dequeued_at).toMatch(/T/);
  });

  test("applyQueueStatusFilter uses legacy-compatible predicates", () => {
    const calls: Array<[string, ...unknown[]]> = [];
    const builder = {
      eq: (...args: unknown[]) => {
        calls.push(["eq", ...args]);
        return builder;
      },
      is: (...args: unknown[]) => {
        calls.push(["is", ...args]);
        return builder;
      },
      or: (...args: unknown[]) => {
        calls.push(["or", ...args]);
        return builder;
      },
      like: (...args: unknown[]) => {
        calls.push(["like", ...args]);
        return builder;
      },
      not: (...args: unknown[]) => {
        calls.push(["not", ...args]);
        return builder;
      },
    };

    applyQueueStatusFilter(builder, "assigned");
    expect(calls).toEqual([
      ["like", "status", "________-____-____-____-____________"],
      ["is", "dequeued_at", null],
    ]);
  });
});

