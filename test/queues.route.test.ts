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
    advanceCallScreenQueue: vi.fn(),
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
}));
vi.mock("@/server/queue-advance-snapshot.server", async importOriginal => ({
  ...(await importOriginal<typeof import("@/server/queue-advance-snapshot.server")>()),
  withQueueAdvanceSnapshots: vi.fn(async rows => rows),
}));
vi.mock("@/server/call-screen-queue-advance.server", async importOriginal => ({
  ...await importOriginal<typeof import("@/server/call-screen-queue-advance.server")>(),
  advanceCallScreenQueue: (...args: unknown[]) => mocks.advanceCallScreenQueue(...args),
}));
// Spreads the real module: the requeue is the only keyed write asserted here.
vi.mock("@/lib/campaign-queue-updates.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/campaign-queue-updates.server")>()),
  requeueAllCampaignQueueForCampaign: (...args: unknown[]) =>
    mocks.requeueAllCampaignQueueForCampaign(...args),
}));
vi.mock("@/lib/platform-telephony.server", () => ({
  resolveCampaignWorkspaceId: (...args: unknown[]) => mocks.resolveCampaignWorkspaceId(...args),
  resolveContactWorkspaceId: (...args: unknown[]) => mocks.resolveContactWorkspaceId(...args),
}));
vi.mock("@/lib/db-rpc.server", () => ({
  rpcSelectAndUpdateCampaignContacts: (...args: unknown[]) => mocks.rpcSelectAndUpdateCampaignContacts(...args),
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
    mocks.advanceCallScreenQueue.mockReset();
    mocks.advanceCallScreenQueue.mockResolvedValue({ ok: true, dequeued: true, advance_state: "dequeued", removed_entries: [] });
    mocks.resolveCampaignWorkspaceId.mockResolvedValue("w1");
    mocks.resolveContactWorkspaceId.mockResolvedValue("w1");
    mocks.fetchCampaignQueueRowsByIds.mockResolvedValue([]);
    mocks.requeueAllCampaignQueueForCampaign.mockResolvedValue([]);
  });

  test("loader returns [] when limit is 0", async () => {
    queueJsonAuthSession({ user: { id: "u1" } });
    const mod = await import("../app/routes/api+/queues");
    const res = await asRouteResponse(mod.loader(withRouteUrl({
      request: new Request("http://localhost/api/queues?campaign_id=1&limit=0"),
    } as any)));
    await expect(res.json()).resolves.toEqual([]);
  });

  test("loader uses default limit when missing", async () => {
    mocks.rpcSelectAndUpdateCampaignContacts.mockResolvedValueOnce([]);
    queueJsonAuthSession({ user: { id: "u1" } });
    const mod = await import("../app/routes/api+/queues");
    const res = await asRouteResponse(mod.loader(withRouteUrl({
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
    const res = await asRouteResponse(mod.loader(withRouteUrl({
      request: new Request("http://localhost/api/queues?campaign_id=1&limit=10"),
    } as any)));
    await expect(res.json()).resolves.toEqual([]);
  });

  test("loader returns queue items from campaign_queue", async () => {
    mocks.rpcSelectAndUpdateCampaignContacts.mockResolvedValueOnce([{ queue_id: 1 }, { queue_id: 2 }]);
    mocks.fetchCampaignQueueRowsByIds.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
    queueJsonAuthSession({ user: { id: "u1" } });

    const mod = await import("../app/routes/api+/queues");
    const res = await asRouteResponse(mod.loader(withRouteUrl({
      request: new Request("http://localhost/api/queues?campaign_id=99&limit=2"),
    } as any)));

    await expect(res.json()).resolves.toEqual([{ id: 1 }, { id: 2 }]);
    expect(mocks.rpcSelectAndUpdateCampaignContacts).toHaveBeenCalledWith("u1", {
      campaignId: 99,
      limit: 2,
    });
    expect(mocks.fetchCampaignQueueRowsByIds).toHaveBeenCalledWith([1, 2], "w1");
  });

  const current = { workspace_id: "w1", contact_id: 2, campaign_id: 7, queue_id: 9,
    dispatch_generation: "10000000-0000-4000-8000-000000000099", voice_reservation_id: null, household: false };
  async function post(body: unknown = current, expectedActor = "u1") {
    queueJsonAuthSession({ user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce(body);
    const mod = await import("../app/routes/api+/queues");
    return asRouteResponse(mod.action(withRouteUrl({ request: new Request("http://localhost/api/queues", {
      method: "POST", headers: { "X-Callcaster-Audio-Actor": expectedActor },
    }) })));
  }

  test("action POST returns 500 when the queue transaction fails", async () => {
    mocks.advanceCallScreenQueue.mockRejectedValueOnce(new Error("Owned queue storage failure"));
    const res = await post();
    expect(res.status).toBe(500);
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  test.each([
    { campaign_id: undefined }, { campaign_id: null }, { campaign_id: true }, { campaign_id: -1 },
    { campaign_id: 1.5 }, { campaign_id: "7abc" }, { campaign_id: Number.MAX_SAFE_INTEGER + 1 },
    { contact_id: 0 }, { household: "false" }, { queue_id: undefined }, { queue_id: 0 },
    { voice_reservation_id: undefined }, { voice_reservation_id: "wrong-owner" }, { household: true },
    { household_snapshot: { household_id: null, entries: [] } }, { dispatch_generation: undefined }, { dispatch_generation: "not-a-generation" }, { call_sid: "not-a-call" },
  ])("action POST rejects invalid captured fields %j before queue access", async patch => {
    const res = await post({ ...current, ...patch });
    expect(res.status).toBe(400);
    expect(mocks.advanceCallScreenQueue).not.toHaveBeenCalled();
    expect(mocks.resolveCampaignWorkspaceId).not.toHaveBeenCalled();
  });

  test("action POST normalizes numeric strings and forwards the complete captured request", async () => {
    const res = await post({ ...current, contact_id: "2", campaign_id: "7", queue_id: "9" });
    expect(res.status).toBe(200);
    expect(mocks.advanceCallScreenQueue).toHaveBeenCalledExactlyOnceWith(current, "u1");
    await expect(res.json()).resolves.toEqual({ ...current, user_id: "u1", success: true, dequeued: true, advance_state: "dequeued", removed_entries: [] });
  });

  test.each(["missing", "different workspace"])("action POST rejects a %s campaign/contact pair", async kind => {
    if (kind === "missing") mocks.resolveCampaignWorkspaceId.mockResolvedValueOnce(null);
    else mocks.resolveContactWorkspaceId.mockResolvedValueOnce("w2");
    expect((await post()).status).toBe(404);
    expect(mocks.advanceCallScreenQueue).not.toHaveBeenCalled();
  });

  test("action POST refuses a changed actor before queue access", async () => {
    expect((await post(current, "previous-agent")).status).toBe(409);
    expect(mocks.advanceCallScreenQueue).not.toHaveBeenCalled();
  });

  test.each(["assigned_elsewhere", "queue_changed"])("action POST retains conflict %s", async reason => {
    mocks.advanceCallScreenQueue.mockResolvedValueOnce({ ok: false, reason });
    const res = await post();
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ code: reason });
  });

  test("an already-dequeued current snapshot has an exact idempotent acknowledgement", async () => {
    mocks.advanceCallScreenQueue.mockResolvedValueOnce({ ok: true, dequeued: false, advance_state: "already_dequeued", removed_entries: [] });
    const res = await post();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ...current, user_id: "u1", success: true, dequeued: false, advance_state: "already_dequeued", removed_entries: [] });
  });

  test("a lost membership during the transaction remains a uniform 404", async () => {
    mocks.advanceCallScreenQueue.mockResolvedValueOnce({ ok: false, reason: "not_found" });
    expect((await post()).status).toBe(404);
  });

  test("action DELETE returns 500 and logs when update errors", async () => {
    mocks.requeueAllCampaignQueueForCampaign.mockRejectedValueOnce(new Error("update fail"));
    queueJsonAuthSession({ user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({ campaignId: "5", userId: "u1" });

    const mod = await import("../app/routes/api+/queues");
    const res = await asRouteResponse(mod.action(withRouteUrl({
      request: new Request("http://localhost/api/queues", { method: "DELETE" }),
    } as any)));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "Queue action failed" });
  });

  test("action DELETE returns affected_rows on success", async () => {
    mocks.requeueAllCampaignQueueForCampaign.mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }]);
    queueJsonAuthSession({ user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({ campaignId: "5", userId: "u1" });

    const mod = await import("../app/routes/api+/queues");
    const res = await asRouteResponse(mod.action(withRouteUrl({
      request: new Request("http://localhost/api/queues", { method: "DELETE" }),
    } as any)));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      message: "Campaign queue items reset successfully",
      affected_rows: 3,
    });
    expect(mocks.requeueAllCampaignQueueForCampaign).toHaveBeenCalledWith(5, "w1");
  });

  test("action returns 405 for unsupported method", async () => {
    queueJsonAuthSession({ user: { id: "u1" } });
    const mod = await import("../app/routes/api+/queues");
    const res = await asRouteResponse(mod.action(withRouteUrl({
      request: new Request("http://localhost/api/queues", { method: "PUT" }),
    } as any)));
    expect(res.status).toBe(405);
  });
});
