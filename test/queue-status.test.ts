import { describe, expect, test } from "vitest";
import {
  buildAssignedQueueUpdate,
  buildDequeuedQueueUpdate,
  buildProviderStatusQueueUpdate,
  buildQueuedQueueUpdate,
  isDequeued,
  isLegalQueueEntryTransition,
  isQueued,
  QUEUE_ENTRY_TRANSITIONS,
} from "@/lib/queue-status";

describe("queue completion semantics", () => {
  test("treats dequeued_at and dequeued queue_state as completed", () => {
    expect(
      isDequeued({
        queue_state: "queued",
        dequeued_at: "2026-01-01T00:00:00Z",
      }),
    ).toBe(true);
    expect(
      isDequeued({
        queue_state: "dequeued",
        dequeued_at: null,
      }),
    ).toBe(true);
  });

  test("queued rows without dequeue metadata are not completed", () => {
    expect(
      isQueued({
        queue_state: "queued",
        dequeued_at: null,
      }),
    ).toBe(true);
    expect(
      isDequeued({
        queue_state: "queued",
        dequeued_at: null,
      }),
    ).toBe(false);
  });

  test("legacy status no longer counts without queue_state", () => {
    expect(
      isQueued({
        status: "queued",
        dequeued_at: null,
      }),
    ).toBe(false);
    expect(
      isDequeued({
        status: "dequeued",
        dequeued_at: null,
      }),
    ).toBe(false);
  });
});

describe("QueueEntry transition table", () => {
  test("queued/assigned/dequeued transitions have no precondition (legalFrom: any)", () => {
    expect(isLegalQueueEntryTransition("queued", null)).toBe(true);
    expect(isLegalQueueEntryTransition("queued", "assigned")).toBe(true);
    expect(isLegalQueueEntryTransition("assigned", "dequeued")).toBe(true);
    expect(isLegalQueueEntryTransition("dequeued", "queued")).toBe(true);
  });

  test("provider_status is only legal from an already-assigned row", () => {
    expect(isLegalQueueEntryTransition("provider_status", "assigned")).toBe(true);
    expect(isLegalQueueEntryTransition("provider_status", "queued")).toBe(false);
    expect(isLegalQueueEntryTransition("provider_status", "dequeued")).toBe(false);
    expect(isLegalQueueEntryTransition("provider_status", null)).toBe(false);
    expect(isLegalQueueEntryTransition("provider_status", undefined)).toBe(false);
  });

  test("column sets match the transition table exactly", () => {
    expect(QUEUE_ENTRY_TRANSITIONS.queued.columns.slice().sort()).toEqual(
      [
        "assigned_to_user_id",
        "dequeued_at",
        "dequeued_by",
        "dequeued_reason",
        "provider_status",
        "queue_state",
      ].sort(),
    );
    expect(QUEUE_ENTRY_TRANSITIONS.assigned.columns.slice().sort()).toEqual(
      [
        "assigned_to_user_id",
        "dequeued_at",
        "dequeued_by",
        "dequeued_reason",
        "provider_status",
        "queue_state",
      ].sort(),
    );
    expect(QUEUE_ENTRY_TRANSITIONS.provider_status.columns.slice().sort()).toEqual(
      ["provider_status", "queue_state"].sort(),
    );
    expect(QUEUE_ENTRY_TRANSITIONS.dequeued.columns.slice().sort()).toEqual(
      [
        "assigned_to_user_id",
        "dequeued_at",
        "dequeued_by",
        "dequeued_reason",
        "provider_status",
        "queue_state",
      ].sort(),
    );
  });

  test("buildQueuedQueueUpdate writes exactly the queued transition's columns", () => {
    expect(buildQueuedQueueUpdate()).toEqual({
      assigned_to_user_id: null,
      dequeued_at: null,
      dequeued_by: null,
      dequeued_reason: null,
      provider_status: null,
      queue_state: "queued",
    });
  });

  test("buildAssignedQueueUpdate writes exactly the assigned transition's columns", () => {
    expect(buildAssignedQueueUpdate("user-123")).toEqual({
      assigned_to_user_id: "user-123",
      dequeued_at: null,
      dequeued_by: null,
      dequeued_reason: null,
      provider_status: null,
      queue_state: "assigned",
    });
  });

  test("buildProviderStatusQueueUpdate writes only provider_status + queue_state (assignment untouched)", () => {
    expect(buildProviderStatusQueueUpdate("in-progress")).toEqual({
      provider_status: "in-progress",
      queue_state: "assigned",
    });
  });

  test("buildDequeuedQueueUpdate writes exactly the dequeued transition's columns", () => {
    const before = Date.now();
    const update = buildDequeuedQueueUpdate("user-456", "no answer");
    const after = Date.now();

    expect(update.assigned_to_user_id).toBeNull();
    expect(update.dequeued_by).toBe("user-456");
    expect(update.dequeued_reason).toBe("no answer");
    expect(update.provider_status).toBeNull();
    expect(update.queue_state).toBe("dequeued");
    expect(typeof update.dequeued_at).toBe("string");
    const dequeuedAtMs = new Date(update.dequeued_at as string).getTime();
    expect(dequeuedAtMs).toBeGreaterThanOrEqual(before);
    expect(dequeuedAtMs).toBeLessThanOrEqual(after);
  });

  test("buildDequeuedQueueUpdate accepts a null dequeuedBy (system-initiated dequeue)", () => {
    const update = buildDequeuedQueueUpdate(null, "api");
    expect(update.dequeued_by).toBeNull();
    expect(update.dequeued_reason).toBe("api");
  });
});
