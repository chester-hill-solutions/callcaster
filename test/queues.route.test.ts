import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { queueJsonAuthSession } from "./helpers/route-auth-mock";

const mocks = vi.hoisted(() => {
  return {
    safeParseJson: vi.fn(),
    logger: { error: vi.fn() , info: vi.fn(), debug: vi.fn()},
  };
});

vi.mock("../app/lib/supabase.server", () => ({
  createSupabaseServerClient: () => ({
    supabaseClient: {},
    headers: new Headers(),
  }),
}));
vi.mock("@/lib/database.server", () => ({
  safeParseJson: (...args: any[]) => mocks.safeParseJson(...args),
  requireWorkspaceAccess: vi.fn(async () => undefined),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

function withQueueActionClient(supabaseClient: { rpc?: ReturnType<typeof vi.fn> }) {
  return withCampaignWorkspace({
    ...supabaseClient,
    from: (table: string) => {
      if (table === "campaign_queue") {
        return {
          select: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: { campaign: { workspace: "w1" } },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  });
}

function withCampaignWorkspace(supabaseClient: any, workspace = "w1") {
  const baseFrom = supabaseClient.from?.bind(supabaseClient);
  return {
    ...supabaseClient,
    from: (table: string) => {
      if (table === "campaign") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { workspace }, error: null }),
            }),
          }),
        };
      }
      if (table === "campaign_queue" && typeof baseFrom === "function") {
        return baseFrom(table);
      }
      if (typeof baseFrom === "function") {
        return baseFrom(table);
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe("app/routes/api+/queues/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.safeParseJson.mockReset();
    mocks.logger.error.mockReset();
  });

  test("loader returns [] when limit is 0", async () => {
    queueJsonAuthSession({ supabaseClient: withCampaignWorkspace({}), user: { id: "u1" } });
    const mod = await import("../app/routes/api+/queues");
    const res = await asRouteResponse(await mod.loader({
      request: new Request("http://localhost/api/queues?campaign_id=1&limit=0"),
    } as any));
    await expect(res.json()).resolves.toEqual([]);
  });

  test("loader uses default limit when missing", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [] });
    queueJsonAuthSession({ supabaseClient: withQueueActionClient({ rpc }), user: { id: "u1" } });
    const mod = await import("../app/routes/api+/queues");
    const res = await asRouteResponse(await mod.loader({
      request: new Request("http://localhost/api/queues?campaign_id=7"),
    } as any));
    await expect(res.json()).resolves.toEqual([]);
    expect(rpc).toHaveBeenCalledWith("select_and_update_campaign_contacts", {
      p_campaign_id: 7,
      p_initial_limit: 10,
    });
  });

  test("loader returns [] when rpc returns empty", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [] });
    queueJsonAuthSession({ supabaseClient: withQueueActionClient({ rpc }), user: { id: "u1" } });
    const mod = await import("../app/routes/api+/queues");
    const res = await asRouteResponse(await mod.loader({
      request: new Request("http://localhost/api/queues?campaign_id=1&limit=10"),
    } as any));
    await expect(res.json()).resolves.toEqual([]);
  });

  test("loader returns queue items from campaign_queue", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [{ queue_id: 1 }, { queue_id: 2 }] });
    const inFn = vi.fn().mockResolvedValueOnce({ data: [{ id: 1 }, { id: 2 }] });
    const select = vi.fn().mockReturnValueOnce({ in: inFn });
    const from = vi.fn().mockReturnValueOnce({ select });
    queueJsonAuthSession({ supabaseClient: withCampaignWorkspace({ rpc, from }), user: { id: "u1" } });

    const mod = await import("../app/routes/api+/queues");
    const res = await asRouteResponse(await mod.loader({
      request: new Request("http://localhost/api/queues?campaign_id=99&limit=2"),
    } as any));

    await expect(res.json()).resolves.toEqual([{ id: 1 }, { id: 2 }]);
    expect(rpc).toHaveBeenCalledWith("select_and_update_campaign_contacts", {
      p_campaign_id: 99,
      p_initial_limit: 2,
    });
    expect(from).toHaveBeenCalledWith("campaign_queue");
    expect(select).toHaveBeenCalledWith("*, contact(*)");
    expect(inFn).toHaveBeenCalledWith("id", [1, 2]);
  });

  test("action POST returns 500 and logs when rpc errors", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: { message: "rpc fail" } });
    queueJsonAuthSession({ supabaseClient: withQueueActionClient({ rpc }), user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({ contact_id: 1, household: true });

    const mod = await import("../app/routes/api+/queues");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/queues", { method: "POST" }),
    } as any));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "rpc fail" });
    expect(mocks.logger.error).toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("dequeue_contact", {
      passed_contact_id: 1,
      group_on_household: true,
      dequeued_by_id: "u1",
      dequeued_reason_text: "Manually dequeued by user",
    });
  });

  test("action POST returns data on success", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: { ok: true }, error: null });
    queueJsonAuthSession({ supabaseClient: withQueueActionClient({ rpc }), user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({ contact_id: 2, household: false });

    const mod = await import("../app/routes/api+/queues");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/queues", { method: "POST" }),
    } as any));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  test("action DELETE returns 500 and logs when update errors", async () => {
    const select = vi.fn().mockResolvedValueOnce({ data: [], error: { message: "update fail" } });
    const eq = vi.fn().mockReturnValueOnce({ select });
    const update = vi.fn().mockReturnValueOnce({ eq });
    const from = vi.fn().mockReturnValueOnce({ update });
    queueJsonAuthSession({ supabaseClient: withCampaignWorkspace({ from }), user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({ campaignId: "5", userId: "u1" });

    const mod = await import("../app/routes/api+/queues");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/queues", { method: "DELETE" }),
    } as any));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "update fail" });
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  test("action DELETE returns affected_rows on success", async () => {
    const select = vi.fn().mockResolvedValueOnce({ data: [{ id: 1 }, { id: 2 }, { id: 3 }], error: null });
    const eq = vi.fn().mockReturnValueOnce({ select });
    const update = vi.fn().mockReturnValueOnce({ eq });
    const from = vi.fn().mockReturnValueOnce({ update });
    queueJsonAuthSession({ supabaseClient: withCampaignWorkspace({ from }), user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({ campaignId: "5", userId: "u1" });

    const mod = await import("../app/routes/api+/queues");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/queues", { method: "DELETE" }),
    } as any));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      message: "Campaign queue items reset successfully",
      affected_rows: 3,
    });
    expect(update).toHaveBeenCalledWith({
      status: "queued",
      dequeued_at: null,
      dequeued_by: null,
      dequeued_reason: null,
      assigned_to_user_id: null,
      provider_status: null,
      queue_state: "queued",
    });
  });

  test("action returns 405 for unsupported method", async () => {
    queueJsonAuthSession({ supabaseClient: withCampaignWorkspace({}), user: { id: "u1" } });
    const mod = await import("../app/routes/api+/queues");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/queues", { method: "PUT" }),
    } as any));
    expect(res.status).toBe(405);
  });
});
