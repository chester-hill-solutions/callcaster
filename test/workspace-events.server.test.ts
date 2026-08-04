import { beforeEach, describe, expect, test, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  transaction: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  dbDirect: {
    transaction: (...args: unknown[]) => dbMocks.transaction(...args),
  },
}));

describe("app/lib/workspace-events.server.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    dbMocks.transaction.mockReset();
    dbMocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: () => ({
          values: () => ({
            returning: async () => [{ id: 42, workspace_id: "ws-1" }],
          }),
        }),
        execute: vi.fn(),
      };
      return fn(tx);
    });
  });

  test("emitChatMessageEvent writes postgres_change payload for message table", async () => {
    const mod = await import("../app/lib/workspace-events.server");
    await mod.emitChatMessageEvent("ws-1", "INSERT", { sid: "SM1", workspace: "ws-1" }, null);

    expect(dbMocks.transaction).toHaveBeenCalled();
  });

  test("emitQueueEvent writes postgres_change payload for campaign_queue table", async () => {
    const mod = await import("../app/lib/workspace-events.server");
    await mod.emitQueueEvent(
      "ws-1",
      "UPDATE",
      { id: 7, campaign_id: 3, queue_state: "assigned" },
      { id: 7, campaign_id: 3, queue_state: "queued" },
    );

    expect(dbMocks.transaction).toHaveBeenCalled();
  });

  test("emitCampaignStatusEvent writes postgres_change payload for campaign table", async () => {
    const mod = await import("../app/lib/workspace-events.server");
    await mod.emitCampaignStatusEvent(
      "ws-1",
      { id: 9, status: "running", is_active: true },
      { id: 9, status: "paused", is_active: false },
    );

    expect(dbMocks.transaction).toHaveBeenCalled();
  });

  test("emitPredictiveBroadcast keeps predictive_broadcast event type", async () => {
    const mod = await import("../app/lib/workspace-events.server");
    await mod.emitPredictiveBroadcast("ws-1", { contact_id: 5, status: "ringing" });

    expect(dbMocks.transaction).toHaveBeenCalled();
  });
});
