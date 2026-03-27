import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    verifyAuth: vi.fn(),
    parseRequestData: vi.fn(),
    enqueueContactsForCampaign: vi.fn(),
    filteredSearch: vi.fn(),
  };
});

vi.mock("@/lib/supabase.server", () => ({
  verifyAuth: (...args: any[]) => mocks.verifyAuth(...args),
}));
vi.mock("@/lib/database.server", () => ({
  parseRequestData: (...args: any[]) => mocks.parseRequestData(...args),
}));
vi.mock("@/lib/queue.server", () => ({
  enqueueContactsForCampaign: (...args: any[]) => mocks.enqueueContactsForCampaign(...args),
}));
vi.mock("../app/routing/workspace/workspaces_.$id.campaigns.$selected_id.queue", () => ({
  filteredSearch: (...args: any[]) => mocks.filteredSearch(...args),
}));

describe("app/routes/api.campaign_queue.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyAuth.mockReset();
    mocks.parseRequestData.mockReset();
    mocks.enqueueContactsForCampaign.mockReset();
    mocks.filteredSearch.mockReset();
  });

  test("redirects to /signin when user missing", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: {}, user: null });
    const mod = await import("../app/routing/api/api.campaign_queue");
    await expect(
      mod.action({ request: new Request("http://x", { method: "POST" }) } as any),
    ).rejects.toBeInstanceOf(Response);
  });

  test("POST enqueues contact ids (string->number), with defaults", async () => {
    const supabaseClient = {};
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient, user: { id: "u1" } });
    mocks.parseRequestData.mockResolvedValueOnce({ ids: ["1", 2], campaign_id: "10" });

    const mod = await import("../app/routing/api/api.campaign_queue");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(mocks.enqueueContactsForCampaign).toHaveBeenCalledWith(supabaseClient, 10, [1, 2], {
      startOrder: 0,
      requeue: false,
    });
  });

  test("DELETE with ids deletes in batches and returns aggregated data", async () => {
    const select = vi.fn().mockResolvedValueOnce({ data: [{ id: 1 }], error: null });
    const inFn = vi.fn().mockReturnValueOnce({ select });
    const eq = vi.fn().mockReturnValueOnce({ in: inFn });
    const del = vi.fn().mockReturnValueOnce({ eq });
    const from = vi.fn().mockReturnValueOnce({ delete: () => ({ eq: (col: string, v: any) => ({ in: (c: string, b: any) => ({ select }) }) }) });

    const supabaseClient = { from };
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient, user: { id: "u1" } });
    mocks.parseRequestData.mockResolvedValueOnce({ ids: [1, 2], campaign_id: 10 });

    const mod = await import("../app/routing/api/api.campaign_queue");
    const res = await mod.action({ request: new Request("http://x", { method: "DELETE" }) } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: [{ id: 1 }] });
  });

  test("DELETE with ids returns 500 on supabase delete error", async () => {
    const supabaseClient = {
      from: vi.fn().mockReturnValueOnce({
        delete: () => ({
          eq: () => ({
            in: () => ({
              select: async () => ({ data: null, error: { message: "bad" } }),
            }),
          }),
        }),
      }),
    };
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient, user: { id: "u1" } });
    mocks.parseRequestData.mockResolvedValueOnce({ ids: [1], campaign_id: 10 });

    const mod = await import("../app/routing/api/api.campaign_queue");
    const res = await mod.action({ request: new Request("http://x", { method: "DELETE" }) } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "bad" });
  });

  test("DELETE without ids uses filteredSearch and safeNumber mapping", async () => {
    const supabaseClient = {
      from: vi.fn().mockReturnValueOnce({
        delete: () => ({
          in: () => ({
            select: async () => ({ data: [{ id: 5 }], error: null }),
          }),
        }),
      }),
    };
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient, user: { id: "u1" } });
    mocks.parseRequestData.mockResolvedValueOnce({ ids: null, campaign_id: 10, filters: { q: "x" } });
    mocks.filteredSearch.mockResolvedValueOnce({
      data: [{ id: "5", contact_id: 1, campaign_id: 10, status: "queued", created_at: "", contact: {} }, {}],
      error: null,
    });

    const mod = await import("../app/routing/api/api.campaign_queue");
    const res = await mod.action({ request: new Request("http://x", { method: "DELETE" }) } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: [{ id: 5 }] });
  });

  test("DELETE without ids returns empty array when filteredSearch returns null data", async () => {
    const supabaseClient = {
      from: vi.fn(),
    };
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient, user: { id: "u1" } });
    mocks.parseRequestData.mockResolvedValueOnce({ ids: null, campaign_id: 10, filters: { q: "x" } });
    mocks.filteredSearch.mockResolvedValueOnce({ data: null, error: null });

    const mod = await import("../app/routing/api/api.campaign_queue");
    const res = await mod.action({ request: new Request("http://x", { method: "DELETE" }) } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: [] });
  });

  test("DELETE without ids returns 500 when delete-in-batch errors", async () => {
    const supabaseClient = {
      from: vi.fn().mockReturnValueOnce({
        delete: () => ({
          in: () => ({
            select: async () => ({ data: null, error: { message: "del bad" } }),
          }),
        }),
      }),
    };
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient, user: { id: "u1" } });
    mocks.parseRequestData.mockResolvedValueOnce({ ids: null, campaign_id: 10, filters: { q: "x" } });
    mocks.filteredSearch.mockResolvedValueOnce({
      data: [{ id: 5, contact_id: 1, campaign_id: 10, status: "queued", created_at: "", contact: {} }],
      error: null,
    });

    const mod = await import("../app/routing/api/api.campaign_queue");
    const res = await mod.action({ request: new Request("http://x", { method: "DELETE" }) } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "del bad" });
  });

  test("DELETE without ids returns 500 on filteredSearch error", async () => {
    const supabaseClient = {};
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient, user: { id: "u1" } });
    mocks.parseRequestData.mockResolvedValueOnce({ ids: null, campaign_id: 10, filters: { q: "x" } });
    mocks.filteredSearch.mockResolvedValueOnce({ data: null, error: { message: "lookup bad" } });

    const mod = await import("../app/routing/api/api.campaign_queue");
    const res = await mod.action({ request: new Request("http://x", { method: "DELETE" }) } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "lookup bad" });
  });

  test("returns 405 for unsupported method", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: {}, user: { id: "u1" } });
    mocks.parseRequestData.mockResolvedValueOnce({});

    const mod = await import("../app/routing/api/api.campaign_queue");
    const res = await mod.action({ request: new Request("http://x", { method: "PUT" }) } as any);
    expect(res.status).toBe(405);
  });
});

