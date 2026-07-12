import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { queueDualAuthSession } from "./helpers/route-auth-mock";

const mocks = vi.hoisted(() => {
  return {
    safeParseJson: vi.fn(),
    enqueueContactsForCampaign: vi.fn(),
    logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  };
});

const audienceDbMocks = vi.hoisted(() => ({
  campaignAndAudienceShareWorkspace: vi.fn(async () => true),
  findCampaignAudienceLink: vi.fn(async () => null),
  insertCampaignAudienceLink: vi.fn(async () => {}),
  deleteCampaignAudienceLink: vi.fn(async () => {}),
  listCampaignAudienceIds: vi.fn(async () => []),
  listContactIdsForAudience: vi.fn(async () => []),
  listContactIdsForAudiences: vi.fn(async () => []),
}));

const queueDbMocks = vi.hoisted(() => ({
  getQueuedContactIdsForCampaign: vi.fn(async () => []),
  deleteQueuedUnattemptedCampaignQueueByCampaignAndContactIds: vi.fn(async () => {}),
}));

vi.mock("@/lib/api-auth.server", () => ({
  getDualAuthUser: (auth: any) => auth,
  requireDualAuth: vi.fn(async () => ({ user: { id: "u1" } })),
}));

vi.mock("@/lib/auth.server", () => ({
  getSession: vi.fn(async () => ({ user: { id: "u1" }, headers: new Headers() })),
}));

vi.mock("@/lib/request-utils.server", () => ({
  safeParseJson: (...args: any[]) => mocks.safeParseJson(...args),
}));

vi.mock("@/lib/queue.server", () => ({
  enqueueContactsForCampaign: (...args: any[]) =>
    mocks.enqueueContactsForCampaign(...args),
}));

vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

vi.mock("@/lib/campaign-audience-db.server", () => ({
  campaignAndAudienceShareWorkspace: (...args: unknown[]) =>
    audienceDbMocks.campaignAndAudienceShareWorkspace(...args),
  findCampaignAudienceLink: (...args: unknown[]) =>
    audienceDbMocks.findCampaignAudienceLink(...args),
  insertCampaignAudienceLink: (...args: unknown[]) =>
    audienceDbMocks.insertCampaignAudienceLink(...args),
  deleteCampaignAudienceLink: (...args: unknown[]) =>
    audienceDbMocks.deleteCampaignAudienceLink(...args),
  listCampaignAudienceIds: (...args: unknown[]) =>
    audienceDbMocks.listCampaignAudienceIds(...args),
  listContactIdsForAudience: (...args: unknown[]) =>
    audienceDbMocks.listContactIdsForAudience(...args),
  listContactIdsForAudiences: (...args: unknown[]) =>
    audienceDbMocks.listContactIdsForAudiences(...args),
}));

vi.mock("@/lib/campaign-queue-db.server", () => ({
  getQueuedContactIdsForCampaign: (...args: unknown[]) =>
    queueDbMocks.getQueuedContactIdsForCampaign(...args),
  deleteQueuedUnattemptedCampaignQueueByCampaignAndContactIds: (...args: unknown[]) =>
    queueDbMocks.deleteQueuedUnattemptedCampaignQueueByCampaignAndContactIds(...args),
}));

describe("app/routes/api+/campaign_audience/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.safeParseJson.mockReset();
    mocks.enqueueContactsForCampaign.mockReset();
    mocks.logger.error.mockReset();
    audienceDbMocks.campaignAndAudienceShareWorkspace.mockReset();
    audienceDbMocks.findCampaignAudienceLink.mockReset();
    audienceDbMocks.insertCampaignAudienceLink.mockReset();
    audienceDbMocks.deleteCampaignAudienceLink.mockReset();
    audienceDbMocks.listCampaignAudienceIds.mockReset();
    audienceDbMocks.listContactIdsForAudience.mockReset();
    audienceDbMocks.listContactIdsForAudiences.mockReset();
    queueDbMocks.getQueuedContactIdsForCampaign.mockReset();
    queueDbMocks.deleteQueuedUnattemptedCampaignQueueByCampaignAndContactIds.mockReset();

    audienceDbMocks.campaignAndAudienceShareWorkspace.mockResolvedValue(true);
    audienceDbMocks.findCampaignAudienceLink.mockResolvedValue(null);
    audienceDbMocks.listContactIdsForAudience.mockResolvedValue([]);
  });

  test("POST returns message when audience already linked", async () => {
    queueDualAuthSession({ user: { id: "u1" } });
    audienceDbMocks.findCampaignAudienceLink.mockResolvedValue({ id: 1 });
    mocks.safeParseJson.mockResolvedValueOnce({
      audience_id: 10,
      campaign_id: 20,
    });

    const mod = await import("../app/routes/api+/campaign_audience");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "POST" }),
    } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      message: "Audience already added to campaign",
    });
  }, 30000);

  test("POST inserts link and enqueues when contacts found", async () => {
    queueDualAuthSession({ user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({
      audience_id: 10,
      campaign_id: 20,
    });
    audienceDbMocks.listContactIdsForAudience.mockResolvedValue([1, 2]);

    const mod = await import("../app/routes/api+/campaign_audience");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "POST" }),
    } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      audienceLinked: true,
      enqueued: 2,
    });
    expect(mocks.enqueueContactsForCampaign).toHaveBeenCalledWith(
      20,
      [1, 2],
      { requeue: false },
    );
  }, 30000);

  test("POST skips enqueue when no contacts found", async () => {
    queueDualAuthSession({ user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({
      audience_id: 10,
      campaign_id: 20,
    });

    const mod = await import("../app/routes/api+/campaign_audience");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "POST" }),
    } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      audienceLinked: true,
      enqueued: 0,
    });
    expect(mocks.enqueueContactsForCampaign).not.toHaveBeenCalled();
  }, 30000);

  test("POST returns 500 with Error.message when insert fails (addError)", async () => {
    queueDualAuthSession({ user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({
      audience_id: 10,
      campaign_id: 20,
    });
    audienceDbMocks.insertCampaignAudienceLink.mockRejectedValue(new Error("add boom"));

    const mod = await import("../app/routes/api+/campaign_audience");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "POST" }),
    } as any));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "add boom" });
    expect(mocks.logger.error).toHaveBeenCalled();
  }, 30000);

  test("POST returns 500 when contact lookup errors (contactsError)", async () => {
    queueDualAuthSession({ user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({
      audience_id: 10,
      campaign_id: 20,
    });
    audienceDbMocks.listContactIdsForAudience.mockRejectedValue(new Error("contacts boom"));

    const mod = await import("../app/routes/api+/campaign_audience");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "POST" }),
    } as any));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "contacts boom" });
    expect(mocks.logger.error).toHaveBeenCalled();
  }, 30000);

  test("DELETE removes audience and queued contacts (when any)", async () => {
    queueDualAuthSession({ user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({
      audience_id: 10,
      campaign_id: 20,
    });
    audienceDbMocks.listCampaignAudienceIds.mockResolvedValue([99]);
    audienceDbMocks.listContactIdsForAudience.mockResolvedValue([1]);
    audienceDbMocks.listContactIdsForAudiences.mockResolvedValue([]);

    const mod = await import("../app/routes/api+/campaign_audience");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "DELETE" }),
    } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(queueDbMocks.deleteQueuedUnattemptedCampaignQueueByCampaignAndContactIds).toHaveBeenCalledWith({
      campaignId: 20,
      contactIds: [1],
    });
  }, 30000);

  test("DELETE returns success when no contacts to remove", async () => {
    queueDualAuthSession({ user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({
      audience_id: 10,
      campaign_id: 20,
    });
    audienceDbMocks.listCampaignAudienceIds.mockResolvedValue([99]);
    audienceDbMocks.listContactIdsForAudience.mockResolvedValue([]);

    const mod = await import("../app/routes/api+/campaign_audience");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "DELETE" }),
    } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
  }, 30000);

  test("DELETE returns 500 when delete link errors", async () => {
    queueDualAuthSession({ user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({
      audience_id: 10,
      campaign_id: 20,
    });
    audienceDbMocks.deleteCampaignAudienceLink.mockRejectedValue(new Error("del boom"));

    const mod = await import("../app/routes/api+/campaign_audience");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "DELETE" }),
    } as any));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "del boom" });
  }, 30000);

  test("DELETE returns 500 when removing queued contacts errors (removeError)", async () => {
    queueDualAuthSession({ user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({
      audience_id: 10,
      campaign_id: 20,
    });
    audienceDbMocks.listCampaignAudienceIds.mockResolvedValue([99]);
    audienceDbMocks.listContactIdsForAudience.mockResolvedValue([1]);
    audienceDbMocks.listContactIdsForAudiences.mockResolvedValue([]);
    queueDbMocks.deleteQueuedUnattemptedCampaignQueueByCampaignAndContactIds.mockRejectedValue(new Error("remove boom"));

    const mod = await import("../app/routes/api+/campaign_audience");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "DELETE" }),
    } as any));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "remove boom" });
  }, 30000);

  test("returns 405 on unsupported method", async () => {
    queueDualAuthSession({ user: { id: "u1" } });
    const mod = await import("../app/routes/api+/campaign_audience");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "PUT" }),
    } as any));
    expect(res.status).toBe(405);
  }, 30000);

  test("catch returns 500 and logs (Error vs non-Error)", async () => {
    queueDualAuthSession({ user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({
      audience_id: 10,
      campaign_id: 20,
    });
    audienceDbMocks.campaignAndAudienceShareWorkspace.mockRejectedValue("boom");

    const mod = await import("../app/routes/api+/campaign_audience");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "POST" }),
    } as any));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "An unexpected error occurred",
    });
    expect(mocks.logger.error).toHaveBeenCalled();
  }, 30000);
});
