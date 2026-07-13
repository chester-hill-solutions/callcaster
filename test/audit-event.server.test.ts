import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/env.server", () => {
  const handler = { get: () => () => "test" };
  return { env: new Proxy({}, handler) };
});

const hoisted = vi.hoisted(() => {
  const insertValues = vi.fn();
  const insert = vi.fn(() => ({ values: insertValues }));
  const selectLimit = vi.fn();
  const selectOrderBy = vi.fn(() => ({ limit: selectLimit }));
  const selectWhere = vi.fn(() => ({ orderBy: selectOrderBy }));
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));
  return {
    insert,
    insertValues,
    select,
    selectFrom,
    selectWhere,
    selectOrderBy,
    selectLimit,
  };
});

vi.mock("@/server/db", () => ({
  db: { insert: hoisted.insert, select: hoisted.select },
}));

import {
  decodeAuditEventCursor,
  encodeAuditEventCursor,
  listWorkspaceAuditEvents,
  parseAuditEventPageSize,
  redactAuditEventMetadata,
  recordWorkspaceAuditEvent,
} from "@/lib/audit-event.server";

describe("redactAuditEventMetadata", () => {
  test("returns an empty object for undefined metadata", () => {
    expect(redactAuditEventMetadata(undefined)).toEqual({});
  });

  test("strips keys matching sensitive metadata patterns", () => {
    expect(
      redactAuditEventMetadata({
        callSid: "CA123",
        password: "hunter2",
        apiSecret: "abc",
        accessToken: "tok",
        Authorization: "Bearer x",
        messageBody: "hello",
        credentialId: "cred-1",
        nested: {
          refreshToken: "rt",
          safe: "ok",
        },
      }),
    ).toEqual({
      callSid: "CA123",
      nested: {
        safe: "ok",
      },
    });
  });

  test("truncates raw strings longer than 500 characters", () => {
    const longValue = "a".repeat(600);
    const redacted = redactAuditEventMetadata({ note: longValue });
    expect(redacted.note).toHaveLength(501);
    expect(redacted.note).toBe(`${"a".repeat(500)}…`);
  });

  test("redacts sensitive keys and truncates strings in nested arrays", () => {
    const longValue = "b".repeat(520);
    expect(
      redactAuditEventMetadata({
        items: [{ token: "drop-me", label: longValue }],
      }),
    ).toEqual({
      items: [{ label: `${"b".repeat(500)}…` }],
    });
  });
});

describe("recordWorkspaceAuditEvent", () => {
  beforeEach(() => {
    hoisted.insert.mockClear();
    hoisted.insertValues.mockReset();
    hoisted.insertValues.mockResolvedValue(undefined);
  });

  test("inserts a redacted audit row via the global db client", async () => {
    await recordWorkspaceAuditEvent({
      workspaceId: "ws-1",
      actorType: "session",
      actorId: "user-1",
      action: "calls.disconnect",
      targetType: "call",
      targetId: "CA123",
      outcome: "success",
      requestId: "req-1",
      metadata: {
        reason: "agent hangup",
        password: "secret",
      },
    });

    expect(hoisted.insert).toHaveBeenCalledTimes(1);
    expect(hoisted.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: "ws-1",
        actor_type: "session",
        actor_id: "user-1",
        action: "calls.disconnect",
        target_type: "call",
        target_id: "CA123",
        outcome: "success",
        request_id: "req-1",
        metadata: { reason: "agent hangup" },
      }),
    );
  });
});

describe("audit event pagination helpers", () => {
  test("parseAuditEventPageSize clamps invalid and oversized values", () => {
    expect(parseAuditEventPageSize(null)).toBe(50);
    expect(parseAuditEventPageSize("0")).toBe(50);
    expect(parseAuditEventPageSize("25")).toBe(25);
    expect(parseAuditEventPageSize("500")).toBe(100);
  });

  test("encode and decode audit cursors round-trip", () => {
    const cursor = encodeAuditEventCursor({
      created_at: "2026-07-13T12:00:00.000Z",
      id: 42,
    });
    expect(decodeAuditEventCursor(cursor)).toEqual({
      createdAt: "2026-07-13T12:00:00.000Z",
      id: 42,
    });
    expect(decodeAuditEventCursor("not-a-cursor")).toBeNull();
  });
});

describe("listWorkspaceAuditEvents", () => {
  beforeEach(() => {
    hoisted.select.mockClear();
    hoisted.selectFrom.mockClear();
    hoisted.selectWhere.mockClear();
    hoisted.selectOrderBy.mockClear();
    hoisted.selectLimit.mockReset();
  });

  test("returns next cursor when more rows exist than the page size", async () => {
    hoisted.selectLimit.mockResolvedValueOnce([
      {
        id: 2,
        created_at: "2026-07-13T12:00:00.000Z",
        workspace_id: "ws-1",
      },
      {
        id: 1,
        created_at: "2026-07-13T11:00:00.000Z",
        workspace_id: "ws-1",
      },
    ]);

    const result = await listWorkspaceAuditEvents({
      workspaceId: "ws-1",
      limit: 1,
    });

    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.id).toBe(2);
    expect(result.nextCursor).toBe(
      encodeAuditEventCursor({
        created_at: "2026-07-13T12:00:00.000Z",
        id: 2,
      }),
    );
    expect(hoisted.selectLimit).toHaveBeenCalledWith(2);
  });
});
