import { describe, expect, test } from "vitest";
import { isDequeued, isQueued } from "@/lib/queue-status";

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
