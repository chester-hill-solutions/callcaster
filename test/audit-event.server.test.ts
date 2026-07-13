import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/env.server", () => {
  const handler = { get: () => () => "test" };
  return { env: new Proxy({}, handler) };
});

const hoisted = vi.hoisted(() => {
  const insertValues = vi.fn();
  const insert = vi.fn(() => ({ values: insertValues }));
  return { insert, insertValues };
});

vi.mock("@/server/db", () => ({
  db: { insert: hoisted.insert },
}));

import {
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
