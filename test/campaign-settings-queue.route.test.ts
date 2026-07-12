import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse, withRouteUrl } from "./helpers/route-result";
const mocks = vi.hoisted(() => {
  return {
    verifyAuth: vi.fn(),
    parseActionRequest: vi.fn(),
    enqueueContactsForCampaign: vi.fn(),
    searchCampaignQueueIds: vi.fn(),
    updateCampaignQueueStatusByIds: vi.fn(),
    deleteAllCampaignQueueForCampaign: vi.fn(),
    deleteCampaignQueueByIds: vi.fn(),
    fetchCampaignQueuePage: vi.fn(),
    countCampaignQueueRows: vi.fn(),
    countQueuedCampaignQueueRows: vi.fn(),
    requireWorkspaceLoaderContext: vi.fn(),
  };
});

const dbMocks = vi.hoisted(() => ({
  selectChain: vi.fn(),
}));

vi.mock("@/lib/auth.server", () => ({
  getSession: () => ({ headers: new Headers(),
  }),
  verifyAuth: (...args: any[]) => mocks.verifyAuth(...args),
}));

vi.mock("@/lib/request-utils.server", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/request-utils.server")
  >("@/lib/request-utils.server");
  return {
    ...actual,
    parseActionRequest: (...args: any[]) => mocks.parseActionRequest(...args),
  };
});

vi.mock("@/lib/queue.server", () => ({
  enqueueContactsForCampaign: (...args: any[]) =>
    mocks.enqueueContactsForCampaign(...args),
}));

vi.mock("@/lib/campaign-queue-db.server", () => ({
  deleteAllCampaignQueueForCampaign: (...args: any[]) =>
    mocks.deleteAllCampaignQueueForCampaign(...args),
  deleteCampaignQueueByIds: (...args: any[]) =>
    mocks.deleteCampaignQueueByIds(...args),
  updateCampaignQueueStatusByIds: (...args: any[]) =>
    mocks.updateCampaignQueueStatusByIds(...args),
}));

vi.mock("@/lib/campaign-queue-search.server", () => ({
  searchCampaignQueueIds: (...args: any[]) =>
    mocks.searchCampaignQueueIds(...args),
  fetchCampaignQueuePage: (...args: any[]) =>
    mocks.fetchCampaignQueuePage(...args),
  countCampaignQueueRows: (...args: any[]) =>
    mocks.countCampaignQueueRows(...args),
  countQueuedCampaignQueueRows: (...args: any[]) =>
    mocks.countQueuedCampaignQueueRows(...args),
}));

vi.mock("@/lib/workspace-route.server", () => ({
  requireWorkspaceLoaderContext: (...args: any[]) =>
    mocks.requireWorkspaceLoaderContext(...args),
}));

vi.mock("@/server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => dbMocks.selectChain(),
      }),
    }),
  },
}));

describe("workspaces_.$id.campaigns.$selected_id.queue action", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.parseActionRequest.mockReset();
    mocks.enqueueContactsForCampaign.mockReset();
    mocks.searchCampaignQueueIds.mockReset();
    mocks.updateCampaignQueueStatusByIds.mockReset();
    mocks.deleteAllCampaignQueueForCampaign.mockReset();
    mocks.deleteCampaignQueueByIds.mockReset();
    mocks.fetchCampaignQueuePage.mockReset();
    mocks.countCampaignQueueRows.mockReset();
    mocks.countQueuedCampaignQueueRows.mockReset();
    mocks.requireWorkspaceLoaderContext.mockReset();
    dbMocks.selectChain.mockReset();
    mocks.verifyAuth.mockResolvedValue({
      user: { id: "u1" },
    });
    mocks.searchCampaignQueueIds.mockResolvedValue([]);
    mocks.updateCampaignQueueStatusByIds.mockResolvedValue(undefined);
    mocks.deleteAllCampaignQueueForCampaign.mockResolvedValue(undefined);
    mocks.deleteCampaignQueueByIds.mockResolvedValue(undefined);
    mocks.fetchCampaignQueuePage.mockResolvedValue({ items: [], totalCount: 0 });
    mocks.countCampaignQueueRows.mockResolvedValue(0);
    mocks.countQueuedCampaignQueueRows.mockResolvedValue(0);
    mocks.requireWorkspaceLoaderContext.mockResolvedValue({
      ok: true,
      context: { user: { id: "u1" }, workspace: { id: "w1" } },
    });
    dbMocks.selectChain.mockResolvedValue([]);
  });

  test("add_from_audience routes contacts through enqueue helper", async () => {
    dbMocks.selectChain.mockResolvedValueOnce([
      { contact_id: 11 },
      { contact_id: 12 },
    ]);

    mocks.parseActionRequest.mockResolvedValueOnce({
      intent: "add_from_audience",
      audienceId: "5",
    });

    const mod = await import(
      "../app/routes/workspaces+/$id/campaigns/$selected_id/queue.route"
    );
    const res = await asRouteResponse(await mod.action(withRouteUrl({
      request: new Request("http://x", { method: "POST" }),
      params: { selected_id: "99" },
    } as any)));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(mocks.enqueueContactsForCampaign).toHaveBeenCalledWith(
      99,
      [11, 12],
      { requeue: false },
    );
  });

  test("add_contacts routes direct contacts through enqueue helper", async () => {
    const dbClient = {
      from: vi.fn(() => {
        throw new Error("unexpected from()");
      }),
    };

    mocks.verifyAuth.mockResolvedValueOnce({
      user: { id: "u1" },
    });
    mocks.parseActionRequest.mockResolvedValueOnce({
      intent: "add_contacts",
      contacts: [{ id: 21 }, { id: 22 }],
    });

    const mod = await import(
      "../app/routes/workspaces+/$id/campaigns/$selected_id/queue.route"
    );
    const res = await asRouteResponse(await mod.action(withRouteUrl({
      request: new Request("http://x", { method: "POST" }),
      params: { selected_id: "77" },
    } as any)));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(mocks.enqueueContactsForCampaign).toHaveBeenCalledWith(
      77,
      [21, 22],
      { requeue: false },
    );
  });

  test("add_from_audience returns contact lookup errors before enqueueing", async () => {
    dbMocks.selectChain.mockRejectedValueOnce(new Error("lookup failed"));

    mocks.parseActionRequest.mockResolvedValueOnce({
      intent: "add_from_audience",
      audienceId: "5",
    });

    const mod = await import(
      "../app/routes/workspaces+/$id/campaigns/$selected_id/queue.route"
    );
    const res = await asRouteResponse(await mod.action(withRouteUrl({
      request: new Request("http://x", { method: "POST" }),
      params: { selected_id: "99" },
    } as any)));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: "lookup failed",
    });
    expect(mocks.enqueueContactsForCampaign).not.toHaveBeenCalled();
  });

  test("loader keeps untouched queued contacts visible", async () => {
    const queueEqCalls: Array<[string, unknown]> = [];
    const queueQueryResult = { data: [], error: null, count: 0 };
    const queueChain: any = {
      select: () => queueChain,
      eq: (column: string, value: unknown) => {
        queueEqCalls.push([column, value]);
        return queueChain;
      },
      or: () => queueChain,
      ilike: () => queueChain,
      like: () => queueChain,
      in: () => queueChain,
      is: () => queueChain,
      not: () => queueChain,
      neq: () => queueChain,
      limit: () => queueChain,
      range: async () => queueQueryResult,
      then: (resolve: (value: typeof queueQueryResult) => unknown) =>
        Promise.resolve(resolve(queueQueryResult)),
    };

    mocks.fetchCampaignQueuePage.mockImplementationOnce(async () => {
      queueChain.eq("campaign_id", "99");
      return { items: [], totalCount: 0 };
    });

    const mod = await import(
      "../app/routes/workspaces+/$id/campaigns/$selected_id/queue.route"
    );

    await mod.loader(withRouteUrl({
      request: new Request("http://x/workspaces/w1/campaigns/99/queue"),
      params: { selected_id: "99" },
    } as any));

    expect(queueEqCalls).not.toContainEqual([
      "contact.outreach_attempt.campaign_id",
      "99",
    ]);
  });

  test("bulk status update no longer filters rows by outreach-attempt campaign id", async () => {
    mocks.searchCampaignQueueIds.mockResolvedValueOnce([11, 12]);
    mocks.updateCampaignQueueStatusByIds.mockResolvedValueOnce(undefined);

    mocks.parseActionRequest.mockResolvedValueOnce({
      intent: "update_status",
      status: "paused",
      isAllSelected: true,
      filters: {
        name: "",
        phone: "",
        email: "",
        address: "",
        audiences: "",
        disposition: "",
        queueStatus: "",
      },
    });

    const mod = await import(
      "../app/routes/workspaces+/$id/campaigns/$selected_id/queue.route"
    );
    const res = await asRouteResponse(await mod.action(withRouteUrl({
      request: new Request("http://x", { method: "POST" }),
      params: { selected_id: "99" },
    } as any)));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(mocks.searchCampaignQueueIds).toHaveBeenCalledWith({
      campaignId: 99,
      filters: {
        name: "",
        phone: "",
        email: "",
        address: "",
        audiences: "",
        disposition: "",
        queueStatus: "",
      },
    });
    expect(mocks.updateCampaignQueueStatusByIds).toHaveBeenCalledWith(
      [11, 12],
      "paused",
    );
  });
});
