import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { queueDualAuthSession } from "./helpers/route-auth-mock";
const postgresServerMocks = vi.hoisted(() => ({ headers: new Headers() }));
const mocks = vi.hoisted(() => {
  return {
    parseRequestData: vi.fn(),
    enqueueContactsForCampaign: vi.fn(),
    searchCampaignQueueIds: vi.fn(),
    deleteCampaignQueueByIds: vi.fn(),
    dbDeleteReturning: vi.fn(),
    dbSelectWhere: vi.fn(),
    requireWorkspaceAccess: vi.fn(),
  };
});

vi.mock("@/lib/auth.server", () => ({
  getSession: () => ({ headers: postgresServerMocks.headers,
  }),
}));
vi.mock("@/lib/platform-telephony.server", () => ({
  resolveCampaignWorkspaceId: vi.fn(async () => "w1"),
}));
vi.mock("@/lib/database/workspace.server", () => ({
  requireWorkspaceAccess: (...args: any[]) =>
    mocks.requireWorkspaceAccess(...args),
}));
vi.mock("@/lib/request-utils.server", () => ({
  parseRequestData: (...args: any[]) => mocks.parseRequestData(...args),
}));
vi.mock("@/lib/queue.server", () => ({
  enqueueContactsForCampaign: (...args: any[]) => mocks.enqueueContactsForCampaign(...args),
}));
vi.mock("@/lib/campaign-queue-search.server", () => ({
  searchCampaignQueueIds: (...args: any[]) => mocks.searchCampaignQueueIds(...args),
}));
vi.mock("@/lib/campaign-queue-db.server", () => ({
  deleteCampaignQueueByIds: (...args: any[]) => mocks.deleteCampaignQueueByIds(...args),
}));
vi.mock("@/server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (...args: any[]) => mocks.dbSelectWhere(...args),
      }),
    }),
    delete: () => ({
      where: () => ({
        returning: (...args: any[]) => mocks.dbDeleteReturning(...args),
      }),
    }),
  },
}));

describe("app/routes/api+/campaign_queue/route.tsx", () => {
  beforeEach(() => {
    mocks.parseRequestData.mockReset();
    mocks.enqueueContactsForCampaign.mockReset();
    mocks.searchCampaignQueueIds.mockReset();
    mocks.deleteCampaignQueueByIds.mockReset();
    mocks.dbDeleteReturning.mockReset();
    mocks.dbSelectWhere.mockReset();
    mocks.dbSelectWhere.mockResolvedValue([]);
  });

  test("redirects to /signin when user missing", async () => {
    queueDualAuthSession({ user: null });
    const mod = await import("../app/routes/api+/campaign_queue");
    const res = await asRouteResponse(
      await mod.action({ request: new Request("http://x", { method: "POST" }) } as any),
    );
    expect(res.status).toBe(401);
  });

  test("POST enqueues contact ids (string->number), with defaults", async () => {
    const dbClient = {};
    queueDualAuthSession({ user: { id: "u1" } });
    mocks.parseRequestData.mockResolvedValueOnce({ ids: ["1", 2], campaign_id: "10" });
    mocks.dbSelectWhere.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);

    const mod = await import("../app/routes/api+/campaign_queue");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(mocks.enqueueContactsForCampaign).toHaveBeenCalledWith(10, [1, 2], {
      startOrder: 0,
      requeue: false,
    });
  });

  test("DELETE with ids deletes in batches and returns aggregated data", async () => {
    queueDualAuthSession({ user: { id: "u1" } });
    mocks.parseRequestData.mockResolvedValueOnce({ ids: [1, 2], campaign_id: 10 });
    mocks.deleteCampaignQueueByIds.mockResolvedValueOnce([{ id: 1 }]);

    const mod = await import("../app/routes/api+/campaign_queue");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "DELETE" }) } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: [{ id: 1 }] });
    expect(mocks.deleteCampaignQueueByIds).toHaveBeenCalledWith([1, 2], "w1");
  });

  test("DELETE with ids returns 500 on delete error", async () => {
    queueDualAuthSession({ user: { id: "u1" } });
    mocks.parseRequestData.mockResolvedValueOnce({ ids: [1], campaign_id: 10 });
    mocks.deleteCampaignQueueByIds.mockRejectedValueOnce(new Error("bad"));

    const mod = await import("../app/routes/api+/campaign_queue");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "DELETE" }) } as any));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "bad" });
  });

  test("DELETE without ids uses searchCampaignQueueIds and safeNumber mapping", async () => {
    queueDualAuthSession({ user: { id: "u1" } });
    mocks.parseRequestData.mockResolvedValueOnce({ ids: null, campaign_id: 10, filters: { q: "x" } });
    mocks.searchCampaignQueueIds.mockResolvedValueOnce([5]);
    mocks.deleteCampaignQueueByIds.mockResolvedValueOnce([{ id: 5 }]);

    const mod = await import("../app/routes/api+/campaign_queue");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "DELETE" }) } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: [{ id: 5 }] });
  });

  test("DELETE without ids returns empty array when search returns no ids", async () => {
    queueDualAuthSession({ user: { id: "u1" } });
    mocks.parseRequestData.mockResolvedValueOnce({ ids: null, campaign_id: 10, filters: { q: "x" } });
    mocks.searchCampaignQueueIds.mockResolvedValueOnce([]);

    const mod = await import("../app/routes/api+/campaign_queue");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "DELETE" }) } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: [] });
  });

  test("DELETE without ids returns 500 when delete-in-batch errors", async () => {
    queueDualAuthSession({ user: { id: "u1" } });
    mocks.parseRequestData.mockResolvedValueOnce({ ids: null, campaign_id: 10, filters: { q: "x" } });
    mocks.searchCampaignQueueIds.mockResolvedValueOnce([5]);
    mocks.deleteCampaignQueueByIds.mockRejectedValueOnce(new Error("del bad"));

    const mod = await import("../app/routes/api+/campaign_queue");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "DELETE" }) } as any));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "del bad" });
  });

  test("DELETE without ids returns 500 on search error", async () => {
    queueDualAuthSession({ user: { id: "u1" } });
    mocks.parseRequestData.mockResolvedValueOnce({ ids: null, campaign_id: 10, filters: { q: "x" } });
    mocks.searchCampaignQueueIds.mockRejectedValueOnce(new Error("lookup bad"));

    const mod = await import("../app/routes/api+/campaign_queue");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "DELETE" }) } as any));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "lookup bad" });
  });

  test("returns 405 for unsupported method", async () => {
    queueDualAuthSession({ user: { id: "u1" } });
    mocks.parseRequestData.mockResolvedValueOnce({});

    const mod = await import("../app/routes/api+/campaign_queue");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "PUT" }) } as any));
    expect(res.status).toBe(405);
  });
});
