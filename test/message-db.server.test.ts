import { beforeEach, describe, expect, test, vi } from "vitest";

const tdbMocks = vi.hoisted(() => ({
  message: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
}));

const messageDbMocks = vi.hoisted(() => ({
  fetchMessagePageForContact: vi.fn(),
}));

describe("app/lib/message-db.server.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    tdbMocks.message.findMany.mockReset();
    tdbMocks.message.update.mockReset();

    vi.doMock("@/server/tenant-db", () => ({
      createTenantDb: vi.fn(() => tdbMocks),
    }));
    vi.doMock("@/server/db", () => ({
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [],
            }),
          }),
        }),
      },
    }));
  });

  test("fetchMessagePageForContact paginates and applies before cursor", async () => {
    tdbMocks.message.findMany.mockResolvedValueOnce([
      { sid: "m2", date_created: "2026-03-02T00:00:00.000Z" },
      { sid: "m1", date_created: "2026-03-01T00:00:00.000Z" },
      { sid: "m0", date_created: "2026-02-28T00:00:00.000Z" },
    ]);

    const mod = await import("../app/lib/message-db.server");
    const result = await mod.fetchMessagePageForContact(
      "w1",
      "+15550001111",
      { pageSize: 2 },
    );

    expect(result.hasMore).toBe(true);
    expect(result.messages.map((row) => row.sid)).toEqual(["m2", "m1"]);
    expect(tdbMocks.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 3 }),
    );
  });

  test("markReceivedMessagesAsDeliveredForPhone updates received inbound rows", async () => {
    tdbMocks.message.update.mockResolvedValueOnce([{ sid: "m1" }]);

    const mod = await import("../app/lib/message-db.server");
    await mod.markReceivedMessagesAsDeliveredForPhone("w1", "+15550001111");

    expect(tdbMocks.message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        set: { status: "delivered" },
      }),
    );
  });
});

describe("app/lib/chats/fetch-message-page.server.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    messageDbMocks.fetchMessagePageForContact.mockReset();

    vi.doMock("@/lib/message-db.server", () => messageDbMocks);
    vi.doMock("../app/lib/logger.server", () => ({
      logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    }));
  });

  test("fetchMessagePage reverses rows chronologically and skips media without client", async () => {
    messageDbMocks.fetchMessagePageForContact.mockResolvedValueOnce({
      messages: [
        { sid: "m2", date_created: "2026-03-02T00:00:00.000Z" },
        { sid: "m1", date_created: "2026-03-01T00:00:00.000Z" },
      ],
      hasMore: false,
    });

    const mod = await import("../app/lib/chats/fetch-message-page.server");
    const result = await mod.fetchMessagePage({
      workspaceId: "w1",
      contactFilter: "+15550001111",
    });

    expect(result.messages.map((row) => row.sid)).toEqual(["m1", "m2"]);
    expect(result.messages.every((row) => Array.isArray(row.signedUrls))).toBe(true);
    expect(result.hasMore).toBe(false);
  });

  test("fetchMessagePage returns empty payload on query failure", async () => {
    messageDbMocks.fetchMessagePageForContact.mockRejectedValueOnce(new Error("db down"));

    const mod = await import("../app/lib/chats/fetch-message-page.server");
    const result = await mod.fetchMessagePage({
      workspaceId: "w1",
      contactFilter: "+15550001111",
    });

    expect(result).toEqual({ messages: [], hasMore: false });
  });
});
