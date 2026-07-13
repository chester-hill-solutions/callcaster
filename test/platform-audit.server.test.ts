import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserRole: vi.fn(),
  listWorkspaceAuditEvents: vi.fn(),
  decodeAuditEventCursor: vi.fn(),
  parseAuditEventPageSize: vi.fn(),
}));

vi.mock("@/lib/database/workspace.server", () => ({
  getUserRole: (...args: unknown[]) => mocks.getUserRole(...args),
}));

vi.mock("@/lib/audit-event.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit-event.server")>();
  return {
    ...actual,
    listWorkspaceAuditEvents: (...args: unknown[]) =>
      mocks.listWorkspaceAuditEvents(...args),
    decodeAuditEventCursor: (...args: unknown[]) =>
      mocks.decodeAuditEventCursor(...args),
    parseAuditEventPageSize: (...args: unknown[]) =>
      mocks.parseAuditEventPageSize(...args),
  };
});

import { listWorkspaceAuditEventsApi } from "@/lib/platform-audit.server";

describe("listWorkspaceAuditEventsApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.parseAuditEventPageSize.mockReturnValue(50);
    mocks.decodeAuditEventCursor.mockReturnValue(null);
    mocks.listWorkspaceAuditEvents.mockResolvedValue({ events: [], nextCursor: null });
  });

  test("rejects API key auth without a session user", async () => {
    const result = await listWorkspaceAuditEventsApi(
      null,
      "ws-1",
      new URLSearchParams(),
    );

    expect(result).toEqual({
      ok: false,
      error: "Audit log access requires a signed-in owner session",
      status: 403,
    });
    expect(mocks.getUserRole).not.toHaveBeenCalled();
  });

  test("rejects non-owner workspace members", async () => {
    mocks.getUserRole.mockResolvedValueOnce({ role: "admin" });

    const result = await listWorkspaceAuditEventsApi(
      "user-1",
      "ws-1",
      new URLSearchParams(),
    );

    expect(result).toEqual({
      ok: false,
      error: "Only workspace owners can view the audit log",
      status: 403,
    });
  });

  test("returns paginated events for owners", async () => {
    mocks.getUserRole.mockResolvedValueOnce({ role: "owner" });
    mocks.decodeAuditEventCursor.mockReturnValueOnce({
      createdAt: "2026-07-13T11:00:00.000Z",
      id: 1,
    });
    mocks.listWorkspaceAuditEvents.mockResolvedValueOnce({
      events: [
        {
          id: 9,
          workspace_id: "ws-1",
          created_at: "2026-07-13T12:00:00.000Z",
          actor_type: "session",
          actor_id: "user-1",
          api_key_id: null,
          action: "calls.disconnect",
          target_type: "call",
          target_id: "CA1",
          outcome: "success",
          request_id: "req-1",
          metadata: { reason: "hangup" },
        },
      ],
      nextCursor: "cursor-abc",
    });

    const result = await listWorkspaceAuditEventsApi(
      "user-1",
      "ws-1",
      new URLSearchParams("limit=25&cursor=abc"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected success");
    }
    expect(result.events).toHaveLength(1);
    expect(result.next_cursor).toBe("cursor-abc");
    expect(mocks.decodeAuditEventCursor).toHaveBeenCalledWith("abc");
    expect(mocks.parseAuditEventPageSize).toHaveBeenCalledWith("25");
    expect(mocks.listWorkspaceAuditEvents).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      limit: 50,
      cursor: {
        createdAt: "2026-07-13T11:00:00.000Z",
        id: 1,
      },
    });
  });

  test("returns 400 for invalid cursor", async () => {
    mocks.getUserRole.mockResolvedValueOnce({ role: "owner" });
    mocks.decodeAuditEventCursor.mockReturnValueOnce(null);

    const result = await listWorkspaceAuditEventsApi(
      "user-1",
      "ws-1",
      new URLSearchParams("cursor=bad"),
    );

    expect(result).toEqual({
      ok: false,
      error: "Invalid cursor",
      status: 400,
    });
  });
});
