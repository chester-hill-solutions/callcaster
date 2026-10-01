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
    // The ISO string below is the *client* shape, not a stale test fixture.
    // `claimed_at`-era code aside, `dequeued_at` is a real `timestamptz` (#2213),
    // so a server-side Drizzle row hands back a `Date` — but these helpers also
    // run in the browser via `useQueue.ts`, where JSON has re-stringified it.
    // This case is why `QueueStateLike.dequeued_at` is `Date | string | null`.
    // Do not "tidy" it to a `Date`; that breaks every client-side caller.
    expect(
      isDequeued({
        queue_state: "queued",
        dequeued_at: "2026-01-01T00:00:00Z",
      }),
    ).toBe(true);
    // The server-side shape, for the other arm of the same union.
    expect(
      isDequeued({
        queue_state: "queued",
        dequeued_at: new Date("2026-01-01T00:00:00Z"),
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
    // `queued` additionally clears `claimed_at`, the in-flight marker from
    // #2208: a requeued row is back in the pool and held by nobody, so a
    // marker left on it would make `claimIsLive` hold it out of every split
    // for a whole lease.
    //
    // `dequeued` and `assigned` deliberately do NOT. Every reader of
    // `claimed_at` already guards on `dequeued_at is null`, so a marker on a
    // dequeued row is unreachable and clearing it there would mean rewriting
    // two hot production functions for nothing; and the manual-dial claim path
    // sets `claimed_at` together with `assigned_to_user_id`, so nulling the
    // marker on a later assign would erase a live claim.
    const claimClearing = [
      "assigned_to_user_id",
      "claimed_at",
      "dequeued_at",
      "dequeued_by",
      "dequeued_reason",
      "provider_status",
      "queue_state",
    ].sort();
    const withoutClaim = [
      "assigned_to_user_id",
      "dequeued_at",
      "dequeued_by",
      "dequeued_reason",
      "provider_status",
      "queue_state",
    ].sort();

    expect(QUEUE_ENTRY_TRANSITIONS.queued.columns.slice().sort()).toEqual(
      claimClearing,
    );
    expect(QUEUE_ENTRY_TRANSITIONS.assigned.columns.slice().sort()).toEqual(
      withoutClaim,
    );
    expect(QUEUE_ENTRY_TRANSITIONS.provider_status.columns.slice().sort()).toEqual(
      ["provider_status", "queue_state"].sort(),
    );
    expect(QUEUE_ENTRY_TRANSITIONS.dequeued.columns.slice().sort()).toEqual(
      withoutClaim,
    );
  });

  test("buildQueuedQueueUpdate writes exactly the queued transition's columns", () => {
    expect(buildQueuedQueueUpdate()).toEqual({
      assigned_to_user_id: null,
      claimed_at: null,
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
    // A real `Date`, not an ISO string. The column is `timestamptz` and the
    // model now says so (#2213), so this asserts the instant directly instead
    // of parsing a string back into one. Handing `dequeued_at` an ISO string is
    // now a compile error, which is the point of the change.
    expect(update.dequeued_at).toBeInstanceOf(Date);
    const dequeuedAtMs = (update.dequeued_at as Date).getTime();
    expect(dequeuedAtMs).toBeGreaterThanOrEqual(before);
    expect(dequeuedAtMs).toBeLessThanOrEqual(after);
  });

  test("buildDequeuedQueueUpdate accepts a null dequeuedBy (system-initiated dequeue)", () => {
    const update = buildDequeuedQueueUpdate(null, "api");
    expect(update.dequeued_by).toBeNull();
    expect(update.dequeued_reason).toBe("api");
  });
});
