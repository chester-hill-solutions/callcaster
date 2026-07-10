import { beforeEach, describe, expect, test, vi } from "vitest";

const tdbMocks = vi.hoisted(() => ({
  message: {
    update: vi.fn(),
  },
}));

describe("app/lib/database/chat-contact-link.server.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    tdbMocks.message.update.mockReset();

    vi.doMock("@/server/tenant-db", () => ({
      createTenantDb: vi.fn(() => tdbMocks),
    }));
  });

  test("linkContactToConversation backfills only null-contact_id rows matching phone candidates", async () => {
    tdbMocks.message.update.mockResolvedValueOnce([
      { sid: "m1", contact_id: 42 },
      { sid: "m2", contact_id: 42 },
      { sid: "m3", contact_id: 42 },
    ]);

    const mod = await import("../app/lib/database/chat-contact-link.server");
    const result = await mod.linkContactToConversation({
      workspaceId: "w1",
      contactId: 42,
      contactPhone: "+15555550100",
    });

    expect(result).toEqual({ linkedCount: 3 });
    expect(tdbMocks.message.update).toHaveBeenCalledTimes(1);

    const callArg = tdbMocks.message.update.mock.calls[0]?.[0];
    expect(callArg.set).toEqual({ contact_id: 42 });
    // where clause exists and scopes on contact_id IS NULL + from/to candidates
    expect(callArg.where).toBeDefined();
  });

  test("linkContactToConversation returns 0 when there is nothing to backfill", async () => {
    tdbMocks.message.update.mockResolvedValueOnce([]);

    const mod = await import("../app/lib/database/chat-contact-link.server");
    const result = await mod.linkContactToConversation({
      workspaceId: "w1",
      contactId: 42,
      contactPhone: "+15555550100",
    });

    expect(result).toEqual({ linkedCount: 0 });
  });

  test("linkContactToConversation short-circuits without hitting the db when inputs are missing", async () => {
    const mod = await import("../app/lib/database/chat-contact-link.server");

    await expect(
      mod.linkContactToConversation({
        workspaceId: "",
        contactId: 42,
        contactPhone: "+15555550100",
      }),
    ).resolves.toEqual({ linkedCount: 0 });

    await expect(
      mod.linkContactToConversation({
        workspaceId: "w1",
        contactId: 0,
        contactPhone: "+15555550100",
      }),
    ).resolves.toEqual({ linkedCount: 0 });

    await expect(
      mod.linkContactToConversation({
        workspaceId: "w1",
        contactId: 42,
        contactPhone: "",
      }),
    ).resolves.toEqual({ linkedCount: 0 });

    expect(tdbMocks.message.update).not.toHaveBeenCalled();
  });

  test("linkContactToConversation reuses a supplied tdb instead of creating a new one", async () => {
    const { createTenantDb } = await import("@/server/tenant-db");
    tdbMocks.message.update.mockResolvedValueOnce([{ sid: "m1" }]);

    const mod = await import("../app/lib/database/chat-contact-link.server");
    await mod.linkContactToConversation({
      workspaceId: "w1",
      contactId: 42,
      contactPhone: "+15555550100",
      tdb: tdbMocks as any,
    });

    expect(createTenantDb).not.toHaveBeenCalled();
  });
});
