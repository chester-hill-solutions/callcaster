import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    getSupabaseServerClientWithSession: vi.fn(),
    safeParseJson: vi.fn(),
    logger: { error: vi.fn() },
  };
});

vi.mock("../app/lib/supabase.server", () => ({
  getSupabaseServerClientWithSession: (...args: any[]) => mocks.getSupabaseServerClientWithSession(...args),
}));
vi.mock("@/lib/database.server", () => ({
  safeParseJson: (...args: any[]) => mocks.safeParseJson(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

describe("app/routes/api.queues.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getSupabaseServerClientWithSession.mockReset();
    mocks.safeParseJson.mockReset();
    mocks.logger.error.mockReset();
  });

  test("loader returns [] when limit is 0", async () => {
    mocks.getSupabaseServerClientWithSession.mockResolvedValueOnce({ supabaseClient: {} });
    const mod = await import("../app/routes/api.queues");
    const res = await mod.loader({
      request: new Request("http://localhost/api/queues?campaign_id=1&limit=0"),
    } as any);
    await expect(res.json()).resolves.toEqual([]);
  });

  test("loader uses default limit when missing", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [] });
    mocks.getSupabaseServerClientWithSession.mockResolvedValueOnce({ supabaseClient: { rpc } });
    const mod = await import("../app/routes/api.queues");
    const res = await mod.loader({
      request: new Request("http://localhost/api/queues?campaign_id=7"),
    } as any);
    await expect(res.json()).resolves.toEqual([]);
    expect(rpc).toHaveBeenCalledWith("select_and_update_campaign_contacts", {
      p_campaign_id: 7,
      p_initial_limit: 10,
    });
  });

  test("loader returns [] when rpc returns empty", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [] });
    mocks.getSupabaseServerClientWithSession.mockResolvedValueOnce({ supabaseClient: { rpc } });
    const mod = await import("../app/routes/api.queues");
    const res = await mod.loader({
      request: new Request("http://localhost/api/queues?campaign_id=1&limit=10"),
    } as any);
    await expect(res.json()).resolves.toEqual([]);
  });

  test("loader returns queue items from campaign_queue", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [{ queue_id: 1 }, { queue_id: 2 }] });
    const inFn = vi.fn().mockResolvedValueOnce({ data: [{ id: 1 }, { id: 2 }] });
    const select = vi.fn().mockReturnValueOnce({ in: inFn });
    const from = vi.fn().mockReturnValueOnce({ select });
    mocks.getSupabaseServerClientWithSession.mockResolvedValueOnce({ supabaseClient: { rpc, from } });

    const mod = await import("../app/routes/api.queues");
    const res = await mod.loader({
      request: new Request("http://localhost/api/queues?campaign_id=99&limit=2"),
    } as any);

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
    mocks.getSupabaseServerClientWithSession.mockResolvedValueOnce({
      supabaseClient: { rpc },
      serverSession: { user: { id: "u1" } },
    });
    mocks.safeParseJson.mockResolvedValueOnce({ contact_id: 1, household: true });

    const mod = await import("../app/routes/api.queues");
    const res = await mod.action({
      request: new Request("http://localhost/api/queues", { method: "POST" }),
    } as any);

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
    mocks.getSupabaseServerClientWithSession.mockResolvedValueOnce({
      supabaseClient: { rpc },
      serverSession: { user: { id: "u1" } },
    });
    mocks.safeParseJson.mockResolvedValueOnce({ contact_id: 2, household: false });

    const mod = await import("../app/routes/api.queues");
    const res = await mod.action({
      request: new Request("http://localhost/api/queues", { method: "POST" }),
    } as any);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  test("action DELETE returns 500 and logs when update errors", async () => {
    const select = vi.fn().mockResolvedValueOnce({ data: [], error: { message: "update fail" } });
    const eq = vi.fn().mockReturnValueOnce({ select });
    const update = vi.fn().mockReturnValueOnce({ eq });
    const from = vi.fn().mockReturnValueOnce({ update });
    mocks.getSupabaseServerClientWithSession.mockResolvedValueOnce({
      supabaseClient: { from },
      serverSession: { user: { id: "u1" } },
    });
    mocks.safeParseJson.mockResolvedValueOnce({ campaignId: "5", userId: "u1" });

    const mod = await import("../app/routes/api.queues");
    const res = await mod.action({
      request: new Request("http://localhost/api/queues", { method: "DELETE" }),
    } as any);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "update fail" });
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  test("action DELETE returns affected_rows on success", async () => {
    const select = vi.fn().mockResolvedValueOnce({ data: [{ id: 1 }, { id: 2 }, { id: 3 }], error: null });
    const eq = vi.fn().mockReturnValueOnce({ select });
    const update = vi.fn().mockReturnValueOnce({ eq });
    const from = vi.fn().mockReturnValueOnce({ update });
    mocks.getSupabaseServerClientWithSession.mockResolvedValueOnce({
      supabaseClient: { from },
      serverSession: { user: { id: "u1" } },
    });
    mocks.safeParseJson.mockResolvedValueOnce({ campaignId: "5", userId: "u1" });

    const mod = await import("../app/routes/api.queues");
    const res = await mod.action({
      request: new Request("http://localhost/api/queues", { method: "DELETE" }),
    } as any);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      message: "Campaign queue items reset successfully",
      affected_rows: 3,
    });
  });

  test("action returns 405 for unsupported method", async () => {
    mocks.getSupabaseServerClientWithSession.mockResolvedValueOnce({
      supabaseClient: {},
      serverSession: { user: { id: "u1" } },
    });
    const mod = await import("../app/routes/api.queues");
    const res = await mod.action({
      request: new Request("http://localhost/api/queues", { method: "PUT" }),
    } as any);
    expect(res.status).toBe(405);
  });
});

