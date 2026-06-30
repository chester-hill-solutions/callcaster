import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { queueDualAuthSession } from "./helpers/route-auth-mock";
const supabaseServerMocks = vi.hoisted(() => ({ headers: new Headers() }));
const mocks = vi.hoisted(() => {
  return {
    parseRequestData: vi.fn(),
    enqueueContactsForCampaign: vi.fn(),
    searchCampaignQueueIds: vi.fn(),
    deleteCampaignQueueByIds: vi.fn(),
    dbDeleteReturning: vi.fn(),
  };
});

vi.mock("@/lib/supabase.server", () => ({
  createSupabaseServerClient: () => ({
    supabaseClient: {},
    headers: supabaseServerMocks.headers,
  }),
}));
vi.mock("@/lib/database.server", () => ({
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
  });

  test("redirects to /signin when user missing", async () => {
    queueDualAuthSession({ supabaseClient: {}, user: null });
    const mod = await import("../app/routes/api+/campaign_queue");
    const res = await asRouteResponse(
      await mod.action({ request: new Request("http://x", { method: "POST" }) } as any),
    );
    expect(res.status).toBe(401);
  });

  test("POST enqueues contact ids (string->number), with defaults", async () => {
    const supabaseClient = {};
    queueDualAuthSession({ supabaseClient, user: { id: "u1" } });
    mocks.parseRequestData.mockResolvedValueOnce({ ids: ["1", 2], campaign_id: "10" });

    const mod = await import("../app/routes/api+/campaign_queue");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(mocks.enqueueContactsForCampaign).toHaveBeenCalledWith(supabaseClient, 10, [1, 2], {
      startOrder: 0,
      requeue: false,
    });
  });

  test("DELETE with ids deletes in batches and returns aggregated data", async () => {
    queueDualAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    mocks.parseRequestData.mockResolvedValueOnce({ ids: [1, 2], campaign_id: 10 });
    mocks.dbDeleteReturning.mockResolvedValueOnce([{ id: 1 }]);

    const mod = await import("../app/routes/api+/campaign_queue");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "DELETE" }) } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: [{ id: 1 }] });
  });

  test("DELETE with ids returns 500 on delete error", async () => {
    queueDualAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    mocks.parseRequestData.mockResolvedValueOnce({ ids: [1], campaign_id: 10 });
    mocks.dbDeleteReturning.mockRejectedValueOnce(new Error("bad"));

    const mod = await import("../app/routes/api+/campaign_queue");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "DELETE" }) } as any));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "bad" });
  });

  test("DELETE without ids uses searchCampaignQueueIds and safeNumber mapping", async () => {
    queueDualAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    mocks.parseRequestData.mockResolvedValueOnce({ ids: null, campaign_id: 10, filters: { q: "x" } });
    mocks.searchCampaignQueueIds.mockResolvedValueOnce([5]);
    mocks.deleteCampaignQueueByIds.mockResolvedValueOnce([{ id: 5 }]);

    const mod = await import("../app/routes/api+/campaign_queue");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "DELETE" }) } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: [{ id: 5 }] });
  });

  test("DELETE without ids returns empty array when search returns no ids", async () => {
    queueDualAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    mocks.parseRequestData.mockResolvedValueOnce({ ids: null, campaign_id: 10, filters: { q: "x" } });
    mocks.searchCampaignQueueIds.mockResolvedValueOnce([]);

    const mod = await import("../app/routes/api+/campaign_queue");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "DELETE" }) } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: [] });
  });

  test("DELETE without ids returns 500 when delete-in-batch errors", async () => {
    queueDualAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    mocks.parseRequestData.mockResolvedValueOnce({ ids: null, campaign_id: 10, filters: { q: "x" } });
    mocks.searchCampaignQueueIds.mockResolvedValueOnce([5]);
    mocks.deleteCampaignQueueByIds.mockRejectedValueOnce(new Error("del bad"));

    const mod = await import("../app/routes/api+/campaign_queue");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "DELETE" }) } as any));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "del bad" });
  });

  test("DELETE without ids returns 500 on search error", async () => {
    queueDualAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    mocks.parseRequestData.mockResolvedValueOnce({ ids: null, campaign_id: 10, filters: { q: "x" } });
    mocks.searchCampaignQueueIds.mockRejectedValueOnce(new Error("lookup bad"));

    const mod = await import("../app/routes/api+/campaign_queue");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "DELETE" }) } as any));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "lookup bad" });
  });

  test("returns 405 for unsupported method", async () => {
    queueDualAuthSession({ supabaseClient: {}, user: { id: "u1" } });
    mocks.parseRequestData.mockResolvedValueOnce({});

    const mod = await import("../app/routes/api+/campaign_queue");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "PUT" }) } as any));
    expect(res.status).toBe(405);
  });
});
