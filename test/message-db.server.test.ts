import { inspect } from "node:util";
import { beforeEach, describe, expect, test, vi } from "vitest";

const tdbMocks = vi.hoisted(() => ({
  message: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
}));

const workspaceEventsMocks = vi.hoisted(() => ({
  emitChatMessageEvent: vi.fn(),
}));

describe("app/lib/message-db.server.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    tdbMocks.message.findMany.mockReset();
    tdbMocks.message.update.mockReset();
    workspaceEventsMocks.emitChatMessageEvent.mockReset();

    vi.doMock("@/server/tenant-db", () => ({
      createTenantDb: vi.fn(() => tdbMocks),
    }));
    vi.doMock("@/lib/workspace-events.server", () => workspaceEventsMocks);
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
      null,
      { pageSize: 2 },
    );

    expect(result.hasMore).toBe(true);
    expect(result.messages.map((row) => row.sid)).toEqual(["m2", "m1"]);
    expect(tdbMocks.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 3 }),
    );
  });

  test("fetchMessagePageForContact does not filter out failed messages", async () => {
    tdbMocks.message.findMany.mockResolvedValueOnce([
      { sid: "m2", status: "failed", date_created: "2026-03-02T00:00:00.000Z" },
      { sid: "m1", status: "delivered", date_created: "2026-03-01T00:00:00.000Z" },
    ]);

    const mod = await import("../app/lib/message-db.server");
    const result = await mod.fetchMessagePageForContact("w1", "+15550001111", null);

    expect(result.messages.map((row) => row.sid)).toEqual(["m2", "m1"]);
    const whereArg = tdbMocks.message.findMany.mock.calls[0]?.[0]?.where;
    expect(inspect(whereArg, { depth: null })).not.toContain("failed");
  });

  test("fetchLatestMessageForPhone does not filter out failed messages", async () => {
    tdbMocks.message.findMany.mockResolvedValueOnce([
      { sid: "m1", status: "failed", date_created: "2026-03-01T00:00:00.000Z" },
    ]);

    const mod = await import("../app/lib/message-db.server");
    const result = await mod.fetchLatestMessageForPhone("w1", "+15550001111");

    expect(result?.sid).toBe("m1");
    expect(result?.status).toBe("failed");
  });

  test("countDistinctNumbersForConversation counts distinct 'other side' numbers", async () => {
    tdbMocks.message.findMany.mockResolvedValueOnce([
      { from: "+15550001111", to: "+15559998888" },
      { from: "+15559998888", to: "+15550001111" },
      { from: "+15550001111", to: "+15557778888" },
    ]);

    const mod = await import("../app/lib/message-db.server");
    const result = await mod.countDistinctNumbersForConversation(
      "w1",
      "+15550001111",
    );

    expect(result).toBe(2);
  });

  test("countDistinctNumbersForConversation returns 1 when only one number was used", async () => {
    tdbMocks.message.findMany.mockResolvedValueOnce([
      { from: "+15550001111", to: "+15559998888" },
      { from: "+15559998888", to: "+15550001111" },
    ]);

    const mod = await import("../app/lib/message-db.server");
    const result = await mod.countDistinctNumbersForConversation(
      "w1",
      "+15550001111",
    );

    expect(result).toBe(1);
  });

  test("markReceivedMessagesAsDeliveredForPhone updates received inbound rows", async () => {
    tdbMocks.message.findMany.mockResolvedValueOnce([
      { sid: "m1", status: "received", direction: "inbound" },
    ]);
    tdbMocks.message.update.mockResolvedValueOnce([
      { sid: "m1", status: "delivered", direction: "inbound" },
    ]);

    const mod = await import("../app/lib/message-db.server");
    await mod.markReceivedMessagesAsDeliveredForPhone("w1", "+15550001111");

    expect(tdbMocks.message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        set: { status: "delivered" },
      }),
    );
  });

  test("markReceivedMessagesAsDeliveredForPhone emits one UPDATE event per flipped row", async () => {
    tdbMocks.message.findMany.mockResolvedValueOnce([
      { sid: "m1", status: "received", direction: "inbound" },
      { sid: "m2", status: "received", direction: "outbound-reply" },
    ]);
    tdbMocks.message.update.mockResolvedValueOnce([
      { sid: "m1", status: "delivered", direction: "inbound" },
      { sid: "m2", status: "delivered", direction: "outbound-reply" },
    ]);

    const mod = await import("../app/lib/message-db.server");
    await mod.markReceivedMessagesAsDeliveredForPhone("w1", "+15550001111");

    expect(workspaceEventsMocks.emitChatMessageEvent).toHaveBeenCalledTimes(2);
    expect(workspaceEventsMocks.emitChatMessageEvent).toHaveBeenNthCalledWith(
      1,
      "w1",
      "UPDATE",
      expect.objectContaining({ sid: "m1", status: "delivered", direction: "inbound" }),
      expect.objectContaining({ sid: "m1", status: "received", direction: "inbound" }),
    );
    expect(workspaceEventsMocks.emitChatMessageEvent).toHaveBeenNthCalledWith(
      2,
      "w1",
      "UPDATE",
      expect.objectContaining({ sid: "m2", status: "delivered", direction: "outbound-reply" }),
      expect.objectContaining({ sid: "m2", status: "received", direction: "outbound-reply" }),
    );
  });

  test("markReceivedMessagesAsDeliveredForPhone emits nothing when no rows flip", async () => {
    tdbMocks.message.findMany.mockResolvedValueOnce([]);
    tdbMocks.message.update.mockResolvedValueOnce([]);

    const mod = await import("../app/lib/message-db.server");
    await mod.markReceivedMessagesAsDeliveredForPhone("w1", "+15550001111");

    expect(workspaceEventsMocks.emitChatMessageEvent).not.toHaveBeenCalled();
  });

  test("markReceivedMessagesAsDeliveredForPhone clears rows stored in a non-E.164 format", async () => {
    tdbMocks.message.findMany.mockResolvedValueOnce([
      { sid: "m1", status: "received", direction: "inbound", from: "5550001111" },
    ]);
    tdbMocks.message.update.mockResolvedValueOnce([
      { sid: "m1", status: "delivered", direction: "inbound", from: "5550001111" },
    ]);

    const mod = await import("../app/lib/message-db.server");
    await mod.markReceivedMessagesAsDeliveredForPhone("w1", "+15550001111");

    const whereArg = tdbMocks.message.update.mock.calls[0]?.[0]?.where;
    const rendered = inspect(whereArg, { depth: null });
    expect(rendered).toContain("5550001111");
    expect(rendered).toContain("15550001111");
    expect(workspaceEventsMocks.emitChatMessageEvent).toHaveBeenCalledWith(
      "w1",
      "UPDATE",
      expect.objectContaining({ sid: "m1", status: "delivered" }),
      expect.objectContaining({ sid: "m1", status: "received" }),
    );
  });

  test("markMessageAsDeliveredBySid emits chat realtime event on flip", async () => {
    tdbMocks.message.findMany.mockResolvedValueOnce([
      { sid: "SM1", status: "received", direction: "inbound", workspace: "w1" },
    ]);
    tdbMocks.message.update.mockResolvedValueOnce([
      { sid: "SM1", status: "delivered", direction: "inbound", workspace: "w1" },
    ]);

    const mod = await import("../app/lib/message-db.server");
    await mod.markMessageAsDeliveredBySid("w1", "SM1");

    expect(workspaceEventsMocks.emitChatMessageEvent).toHaveBeenCalledWith(
      "w1",
      "UPDATE",
      expect.objectContaining({ sid: "SM1", status: "delivered", direction: "inbound" }),
      expect.objectContaining({ sid: "SM1", status: "received", direction: "inbound" }),
    );
  });

  test("markMessageAsDeliveredBySid emits nothing when no rows flip", async () => {
    tdbMocks.message.findMany.mockResolvedValueOnce([]);
    tdbMocks.message.update.mockResolvedValueOnce([]);

    const mod = await import("../app/lib/message-db.server");
    await mod.markMessageAsDeliveredBySid("w1", "SM_MISSING");

    expect(workspaceEventsMocks.emitChatMessageEvent).not.toHaveBeenCalled();
  });

  test("expandPhoneMatchVariants expands E.164 input into raw stored variants", async () => {
    const mod = await import("../app/lib/message-db.server");
    const variants = mod.expandPhoneMatchVariants("+15550001111");

    expect(new Set(variants)).toEqual(
      new Set(["+15550001111", "15550001111", "5550001111"]),
    );
  });

  test("expandPhoneMatchVariants expands bare 10-digit input", async () => {
    const mod = await import("../app/lib/message-db.server");
    const variants = mod.expandPhoneMatchVariants("5550001111");

    expect(new Set(variants)).toEqual(
      new Set(["+15550001111", "15550001111", "5550001111"]),
    );
  });

  test("expandPhoneMatchVariants expands 11-digit leading-1 input", async () => {
    const mod = await import("../app/lib/message-db.server");
    const variants = mod.expandPhoneMatchVariants("15550001111");

    expect(new Set(variants)).toEqual(
      new Set(["+15550001111", "15550001111", "5550001111"]),
    );
  });

  test("expandPhoneMatchVariants returns the original value as sole variant for empty/junk input", async () => {
    const mod = await import("../app/lib/message-db.server");

    expect(mod.expandPhoneMatchVariants("")).toEqual([""]);
    expect(mod.expandPhoneMatchVariants("not-a-phone")).toEqual(["not-a-phone"]);
  });

  test("updateMessageBySid emits chat realtime event after update", async () => {
    tdbMocks.message.findMany.mockResolvedValueOnce([
      { sid: "SM1", status: "received", workspace: "w1" },
    ]);
    tdbMocks.message.update.mockResolvedValueOnce([
      { sid: "SM1", status: "delivered", workspace: "w1" },
    ]);

    const mod = await import("../app/lib/message-db.server");
    const result = await mod.updateMessageBySid("w1", "SM1", { status: "delivered" });

    expect(result?.status).toBe("delivered");
    expect(workspaceEventsMocks.emitChatMessageEvent).toHaveBeenCalledWith(
      "w1",
      "UPDATE",
      expect.objectContaining({ sid: "SM1", status: "delivered" }),
      expect.objectContaining({ sid: "SM1", status: "received" }),
    );
  });
});

const messageDbMocks = vi.hoisted(() => ({
  fetchMessagePageForContact: vi.fn(),
}));

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
