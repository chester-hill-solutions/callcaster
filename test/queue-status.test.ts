import { describe, expect, test } from "vitest";

import {
  applyQueueStatusFilter,
  buildAssignedQueueUpdate,
  buildDequeuedQueueUpdate,
  buildProviderStatusQueueUpdate,
  buildQueuedQueueUpdate,
  COMPLETED_QUEUE_COUNT_FILTER,
  getAssignedUserId,
  getQueueLifecycle,
  getQueueDisplayLabel,
  getQueueDisplayState,
  getProviderStatus,
  isDequeued,
  isAssignedToUser,
  isQueued,
  isUserAssignment,
  matchesQueueStatusFilter,
  QUEUE_LIFECYCLE_ASSIGNED,
  QUEUE_LIFECYCLE_CANCELED,
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
    expect(getQueueDisplayState("ringing", "2026-03-10T00:00:00.000Z")).toBe(
      "completed",
    );
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

  test("queue lifecycle and filter helpers cover legacy and normalized shapes", () => {
    const userUuid = "550e8400-e29b-41d4-a716-446655440000";

    expect(getQueueLifecycle({ status: "dequeued" })).toBe(
      QUEUE_STATUS_DEQUEUED,
    );
    expect(getQueueLifecycle({ queue_state: QUEUE_LIFECYCLE_CANCELED })).toBe(
      QUEUE_LIFECYCLE_CANCELED,
    );
    expect(getQueueLifecycle({ queue_state: QUEUE_LIFECYCLE_ASSIGNED })).toBe(
      QUEUE_LIFECYCLE_ASSIGNED,
    );
    expect(getQueueLifecycle({ status: QUEUE_STATUS_QUEUED })).toBe(
      QUEUE_STATUS_QUEUED,
    );
    expect(getQueueLifecycle({ status: userUuid })).toBe(
      QUEUE_LIFECYCLE_ASSIGNED,
    );
    expect(getQueueLifecycle({ status: null })).toBe(QUEUE_LIFECYCLE_ASSIGNED);

    expect(
      matchesQueueStatusFilter({ status: QUEUE_STATUS_QUEUED }, "queued"),
    ).toBe(true);
    expect(matchesQueueStatusFilter({ status: "in-progress" }, "active")).toBe(
      true,
    );
  });

  test("normalized queue update builders include new fields when enabled", () => {
    expect(buildQueuedQueueUpdate({ includeNormalizedFields: true })).toEqual({
      status: "queued",
      dequeued_at: null,
      dequeued_by: null,
      dequeued_reason: null,
      assigned_to_user_id: null,
      provider_status: null,
      queue_state: "queued",
    });

    expect(
      buildAssignedQueueUpdate("user-2", { includeNormalizedFields: true }),
    ).toEqual({
      status: "user-2",
      dequeued_at: null,
      dequeued_by: null,
      dequeued_reason: null,
      assigned_to_user_id: "user-2",
      provider_status: null,
      queue_state: "assigned",
    });

    expect(
      buildProviderStatusQueueUpdate("ringing", {
        includeNormalizedFields: true,
      }),
    ).toEqual({
      status: "ringing",
      provider_status: "ringing",
      queue_state: "assigned",
    });

    const normalizedDequeued = buildDequeuedQueueUpdate("user-2", "done", {
      includeNormalizedFields: true,
    });
    expect(normalizedDequeued.status).toBe("dequeued");
    expect(normalizedDequeued.assigned_to_user_id).toBeNull();
    expect(normalizedDequeued.provider_status).toBeNull();
    expect(normalizedDequeued.queue_state).toBe("dequeued");
  });

  test("applyQueueStatusFilter covers queued, completed, and active branches", () => {
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

    applyQueueStatusFilter(builder, "queued");
    applyQueueStatusFilter(builder, "completed");
    applyQueueStatusFilter(builder, "active");

    expect(calls).toContainEqual(["eq", "status", "queued"]);
    expect(calls).toContainEqual([
      "or",
      "status.eq.dequeued,dequeued_at.not.is.null",
    ]);
    expect(calls).toContainEqual([
      "not",
      "status",
      "in",
      '("queued","dequeued")',
    ]);
  });

  test("handles edge conditions for provider and queued checks", () => {
    expect(
      getProviderStatus({
        status: "ringing",
        assigned_to_user_id: null,
        provider_status: null,
      }),
    ).toBe("ringing");

    expect(
      getAssignedUserId({ status: undefined, assigned_to_user_id: null }),
    ).toBeNull();

    expect(
      isQueued({
        queue_state: "queued",
        status: "queued",
        dequeued_at: "2026-01-01",
      }),
    ).toBe(false);

    expect(getQueueDisplayState({ status: null, queue_state: null })).toBe(
      "active",
    );
  });
});
