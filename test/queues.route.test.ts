import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse, withRouteUrl } from "./helpers/route-result";
import { queueJsonAuthSession } from "./helpers/route-auth-mock";

const mocks = vi.hoisted(() => {
  return {
    safeParseJson: vi.fn(),
    logger: { error: vi.fn() , info: vi.fn(), debug: vi.fn()},
    fetchCampaignQueueRowsByIds: vi.fn(async () => []),
    requeueAllCampaignQueueForCampaign: vi.fn(async () => []),
    resolveCampaignWorkspaceId: vi.fn(async () => "w1"),
    resolveContactWorkspaceId: vi.fn(async () => "w1"),
    rpcSelectAndUpdateCampaignContacts: vi.fn(async () => []),
    rpcDequeueContact: vi.fn(async () => ({})),
  };
});

vi.mock("@/lib/api-auth.server", () => ({
  requireJsonAuth: vi.fn(async () => ({ user: { id: "u1" }, headers: new Headers() })),
}));
vi.mock("@/lib/database/workspace.server", () => ({
  requireWorkspaceAccess: vi.fn(async () => undefined),
}));
vi.mock("@/lib/request-utils.server", () => ({
  safeParseJson: (...args: any[]) => mocks.safeParseJson(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/campaign-queue-db.server", () => ({
  fetchCampaignQueueRowsByIds: (...args: unknown[]) => mocks.fetchCampaignQueueRowsByIds(...args),
  requeueAllCampaignQueueForCampaign: (...args: unknown[]) =>
    mocks.requeueAllCampaignQueueForCampaign(...args),
}));
vi.mock("@/lib/platform-telephony.server", () => ({
  resolveCampaignWorkspaceId: (...args: unknown[]) => mocks.resolveCampaignWorkspaceId(...args),
  resolveContactWorkspaceId: (...args: unknown[]) => mocks.resolveContactWorkspaceId(...args),
}));
vi.mock("@/lib/db-rpc.server", () => ({
  rpcSelectAndUpdateCampaignContacts: (...args: unknown[]) => mocks.rpcSelectAndUpdateCampaignContacts(...args),
  rpcDequeueContact: (...args: unknown[]) => mocks.rpcDequeueContact(...args),
}));

describe("app/routes/api+/queues/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.safeParseJson.mockReset();
    mocks.logger.error.mockReset();
    mocks.fetchCampaignQueueRowsByIds.mockReset();
    mocks.requeueAllCampaignQueueForCampaign.mockReset();
    mocks.resolveCampaignWorkspaceId.mockReset();
    mocks.resolveContactWorkspaceId.mockReset();
    mocks.rpcSelectAndUpdateCampaignContacts.mockReset();
    mocks.rpcDequeueContact.mockReset();
    mocks.resolveCampaignWorkspaceId.mockResolvedValue("w1");
    mocks.resolveContactWorkspaceId.mockResolvedValue("w1");
    mocks.fetchCampaignQueueRowsByIds.mockResolvedValue([]);
    mocks.requeueAllCampaignQueueForCampaign.mockResolvedValue([]);
  });

  test("loader returns [] when limit is 0", async () => {
    queueJsonAuthSession({ user: { id: "u1" } });
    const mod = await import("../app/routes/api+/queues");
    const res = await asRouteResponse(await mod.loader(withRouteUrl({
      request: new Request("http://localhost/api/queues?campaign_id=1&limit=0"),
    } as any)));
    await expect(res.json()).resolves.toEqual([]);
  });

  test("loader uses default limit when missing", async () => {
    mocks.rpcSelectAndUpdateCampaignContacts.mockResolvedValueOnce([]);
    queueJsonAuthSession({ user: { id: "u1" } });
    const mod = await import("../app/routes/api+/queues");
    const res = await asRouteResponse(await mod.loader(withRouteUrl({
      request: new Request("http://localhost/api/queues?campaign_id=7"),
    } as any)));
    await expect(res.json()).resolves.toEqual([]);
    expect(mocks.rpcSelectAndUpdateCampaignContacts).toHaveBeenCalledWith("u1", {
      campaignId: 7,
      limit: 10,
    });
  });

  test("loader returns [] when rpc returns empty", async () => {
    mocks.rpcSelectAndUpdateCampaignContacts.mockResolvedValueOnce([]);
    queueJsonAuthSession({ user: { id: "u1" } });
    const mod = await import("../app/routes/api+/queues");
    const res = await asRouteResponse(await mod.loader(withRouteUrl({
      request: new Request("http://localhost/api/queues?campaign_id=1&limit=10"),
    } as any)));
    await expect(res.json()).resolves.toEqual([]);
  });

  test("loader returns queue items from campaign_queue", async () => {
    mocks.rpcSelectAndUpdateCampaignContacts.mockResolvedValueOnce([{ queue_id: 1 }, { queue_id: 2 }]);
    mocks.fetchCampaignQueueRowsByIds.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
    queueJsonAuthSession({ user: { id: "u1" } });

    const mod = await import("../app/routes/api+/queues");
    const res = await asRouteResponse(await mod.loader(withRouteUrl({
      request: new Request("http://localhost/api/queues?campaign_id=99&limit=2"),
    } as any)));

    await expect(res.json()).resolves.toEqual([{ id: 1 }, { id: 2 }]);
    expect(mocks.rpcSelectAndUpdateCampaignContacts).toHaveBeenCalledWith("u1", {
      campaignId: 99,
      limit: 2,
    });
    expect(mocks.fetchCampaignQueueRowsByIds).toHaveBeenCalledWith([1, 2]);
  });

  test("action POST returns 500 and logs when rpc errors", async () => {
    mocks.rpcDequeueContact.mockRejectedValueOnce(new Error("rpc fail"));
    queueJsonAuthSession({ user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({ contact_id: 1, household: true });

    const mod = await import("../app/routes/api+/queues");
    const res = await asRouteResponse(await mod.action(withRouteUrl({
      request: new Request("http://localhost/api/queues", { method: "POST" }),
    } as any)));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "rpc fail" });
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  test("action POST returns data on success", async () => {
    mocks.rpcDequeueContact.mockResolvedValueOnce({ ok: true });
    queueJsonAuthSession({ user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({ contact_id: 2, household: false });

    const mod = await import("../app/routes/api+/queues");
    const res = await asRouteResponse(await mod.action(withRouteUrl({
      request: new Request("http://localhost/api/queues", { method: "POST" }),
    } as any)));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
  });

  test("action DELETE returns 500 and logs when update errors", async () => {
    mocks.requeueAllCampaignQueueForCampaign.mockRejectedValueOnce(new Error("update fail"));
    queueJsonAuthSession({ user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({ campaignId: "5", userId: "u1" });

    const mod = await import("../app/routes/api+/queues");
    const res = await asRouteResponse(await mod.action(withRouteUrl({
      request: new Request("http://localhost/api/queues", { method: "DELETE" }),
    } as any)));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "update fail" });
  });

  test("action DELETE returns affected_rows on success", async () => {
    mocks.requeueAllCampaignQueueForCampaign.mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }]);
    queueJsonAuthSession({ user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({ campaignId: "5", userId: "u1" });

    const mod = await import("../app/routes/api+/queues");
    const res = await asRouteResponse(await mod.action(withRouteUrl({
      request: new Request("http://localhost/api/queues", { method: "DELETE" }),
    } as any)));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      message: "Campaign queue items reset successfully",
      affected_rows: 3,
    });
    expect(mocks.requeueAllCampaignQueueForCampaign).toHaveBeenCalledWith(5);
  });

  test("action returns 405 for unsupported method", async () => {
    queueJsonAuthSession({ user: { id: "u1" } });
    const mod = await import("../app/routes/api+/queues");
    const res = await asRouteResponse(await mod.action(withRouteUrl({
      request: new Request("http://localhost/api/queues", { method: "PUT" }),
    } as any)));
    expect(res.status).toBe(405);
  });
});
