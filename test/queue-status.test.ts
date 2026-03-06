import { describe, expect, test } from "vitest";

import {
  isAssignedToUser,
  isQueued,
  isUserAssignment,
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
});

