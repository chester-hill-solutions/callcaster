import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    verifyAuth: vi.fn(),
    safeParseJson: vi.fn(),
    requireWorkspaceAccess: vi.fn(),
    logger: { error: vi.fn() },
  };
});

vi.mock("@/lib/supabase.server", () => ({
  verifyAuth: (...args: any[]) => mocks.verifyAuth(...args),
}));
vi.mock("@/lib/database.server", () => ({
  safeParseJson: (...args: any[]) => mocks.safeParseJson(...args),
  requireWorkspaceAccess: (...args: any[]) => mocks.requireWorkspaceAccess(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

function makeSearchBuilder(result: { data: any; error: any }) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          gte: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                single: vi.fn(async () => result),
              })),
            })),
          })),
        })),
      })),
    })),
  };
}

function makeUpdateBuilder(selectResult: { data: any; error: any }, updateSpy?: any) {
  return {
    update: (updateSpy ?? vi.fn()) as any,
    eq: vi.fn(),
    select: vi.fn(async () => selectResult),
  };
}

describe("app/routes/api.questions.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyAuth.mockReset();
    mocks.safeParseJson.mockReset();
    mocks.requireWorkspaceAccess.mockReset();
    mocks.logger.error.mockReset();
  });

  test("returns 500 when recent outreach search errors (non-PGRST116)", async () => {
    const headers = new Headers({ "Set-Cookie": "a=1" });
    const searchError = { code: "SOMETHING", message: "bad" };
    const supabaseClient = {
      from: vi.fn().mockReturnValueOnce(makeSearchBuilder({ data: null, error: searchError })),
    };
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient,
      headers,
      user: { id: "u1" },
    });
    mocks.safeParseJson.mockResolvedValueOnce({
      update: { hello: "world" },
      contact_id: 1,
      campaign_id: 2,
      workspace: "w1",
      disposition: "completed",
      queue_id: 3,
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);

    const mod = await import("../app/routes/api.questions");
    const res = await mod.action({
      request: new Request("http://localhost/api/questions", { method: "POST" }),
    } as any);

    expect(res.status).toBe(500);
    expect(res.headers.get("Set-Cookie")).toBe("a=1");
    await expect(res.json()).resolves.toEqual({ error: searchError });
    expect(mocks.logger.error).toHaveBeenCalled();
    expect(mocks.requireWorkspaceAccess).toHaveBeenCalledWith({ supabaseClient, user: { id: "u1" }, workspaceId: "w1" });
  });

  test("creates outreach when none recent (PGRST116), coerces rpc id string, and returns updated outreach", async () => {
    const headers = new Headers({ "Set-Cookie": "b=2" });
    const finalUpdateSpy = vi.fn().mockReturnValue({
      eq: vi.fn(() => ({ select: vi.fn(async () => ({ data: [{ id: 7, disposition: "done", result: { a: 1 } }], error: null })) })),
    });
    const supabaseClient = {
      from: vi
        .fn()
        .mockReturnValueOnce(makeSearchBuilder({ data: null, error: { code: "PGRST116" } }))
        .mockReturnValueOnce({ update: finalUpdateSpy }),
      rpc: vi.fn().mockResolvedValueOnce({ data: "7", error: null }),
    };
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient,
      headers,
      user: { id: "u1" },
    });
    mocks.safeParseJson.mockResolvedValueOnce({
      update: { a: 1 },
      contact_id: 1,
      campaign_id: 2,
      workspace: "w1",
      disposition: "done",
      queue_id: 3,
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);

    const mod = await import("../app/routes/api.questions");
    const res = await mod.action({
      request: new Request("http://localhost/api/questions", { method: "POST" }),
    } as any);

    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toBe("b=2");
    await expect(res.json()).resolves.toEqual({ id: 7, disposition: "done", result: { a: 1 } });
    expect(supabaseClient.rpc).toHaveBeenCalledWith("create_outreach_attempt", {
      con_id: 1,
      cam_id: 2,
      queue_id: 3,
      wks_id: "w1",
      usr_id: "u1",
    });
  });

  test("returns 500 when rpc create_outreach_attempt errors", async () => {
    const headers = new Headers();
    const rpcError = { message: "rpc bad" };
    const supabaseClient = {
      from: vi.fn().mockReturnValueOnce(makeSearchBuilder({ data: null, error: { code: "PGRST116" } })),
      rpc: vi.fn().mockResolvedValueOnce({ data: null, error: rpcError }),
    };
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient,
      headers,
      user: { id: "u1" },
    });
    mocks.safeParseJson.mockResolvedValueOnce({
      update: { a: 1 },
      contact_id: 1,
      campaign_id: 2,
      workspace: "w1",
      disposition: "done",
      queue_id: 3,
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);

    const mod = await import("../app/routes/api.questions");
    const res = await mod.action({
      request: new Request("http://localhost/api/questions", { method: "POST" }),
    } as any);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: rpcError });
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  test("updates existing outreach when recentOutreach exists (update undefined branch)", async () => {
    const headers = new Headers();
    const supabaseClient = {
      from: vi
        .fn()
        .mockReturnValueOnce(makeSearchBuilder({ data: { id: 1 }, error: null }))
        .mockReturnValueOnce({
          update: vi.fn().mockReturnValueOnce({
            eq: vi.fn(() => ({
              select: vi.fn(async () => ({ data: [{ id: 1 }], error: null })),
            })),
          }),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnValueOnce({
            eq: vi.fn(() => ({
              select: vi.fn(async () => ({ data: [{ id: 1, disposition: "completed" }], error: null })),
            })),
          }),
        }),
    };
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient,
      headers,
      user: { id: "u1" },
    });
    mocks.safeParseJson.mockResolvedValueOnce({
      update: undefined,
      contact_id: 1,
      campaign_id: 2,
      workspace: "w1",
      disposition: "completed",
      queue_id: 3,
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);

    const mod = await import("../app/routes/api.questions");
    const res = await mod.action({
      request: new Request("http://localhost/api/questions", { method: "POST" }),
    } as any);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ id: 1, disposition: "completed" });
  });

  test("returns 500 when updating recent outreach attempt errors", async () => {
    const headers = new Headers();
    const updateError = { message: "update bad" };
    const supabaseClient = {
      from: vi
        .fn()
        .mockReturnValueOnce(makeSearchBuilder({ data: { id: 1 }, error: null }))
        .mockReturnValueOnce({
          update: vi.fn().mockReturnValueOnce({
            eq: vi.fn(() => ({
              select: vi.fn(async () => ({ data: [], error: updateError })),
            })),
          }),
        }),
    };
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient,
      headers,
      user: { id: "u1" },
    });
    mocks.safeParseJson.mockResolvedValueOnce({
      update: { a: 1 },
      contact_id: 1,
      campaign_id: 2,
      workspace: "w1",
      disposition: "completed",
      queue_id: 3,
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);

    const mod = await import("../app/routes/api.questions");
    const res = await mod.action({
      request: new Request("http://localhost/api/questions", { method: "POST" }),
    } as any);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: updateError });
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  test("covers data[0]?.id ?? null when recent update returns empty data", async () => {
    const headers = new Headers();
    const supabaseClient = {
      from: vi
        .fn()
        .mockReturnValueOnce(makeSearchBuilder({ data: { id: 1 }, error: null }))
        .mockReturnValueOnce({
          update: vi.fn().mockReturnValueOnce({
            eq: vi.fn(() => ({
              select: vi.fn(async () => ({ data: [], error: null })),
            })),
          }),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnValueOnce({
            eq: vi.fn(() => ({
              select: vi.fn(async () => ({ data: [{ id: null, disposition: "completed" }], error: null })),
            })),
          }),
        }),
    };
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient,
      headers,
      user: { id: "u1" },
    });
    mocks.safeParseJson.mockResolvedValueOnce({
      update: undefined,
      contact_id: 1,
      campaign_id: 2,
      workspace: "w1",
      disposition: "completed",
      queue_id: 3,
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);

    const mod = await import("../app/routes/api.questions");
    const res = await mod.action({
      request: new Request("http://localhost/api/questions", { method: "POST" }),
    } as any);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ id: null, disposition: "completed" });
  });

  test("returns 500 when final outreach update errors", async () => {
    const headers = new Headers();
    const updateError = { message: "final bad" };
    const supabaseClient = {
      from: vi
        .fn()
        .mockReturnValueOnce(makeSearchBuilder({ data: null, error: { code: "PGRST116" } }))
        .mockReturnValueOnce({
          update: vi.fn().mockReturnValueOnce({
            eq: vi.fn(() => ({
              select: vi.fn(async () => ({ data: [], error: updateError })),
            })),
          }),
        }),
      rpc: vi.fn().mockResolvedValueOnce({ data: 9, error: null }),
    };
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient,
      headers,
      user: { id: "u1" },
    });
    mocks.safeParseJson.mockResolvedValueOnce({
      update: { a: 1 },
      contact_id: 1,
      campaign_id: 2,
      workspace: "w1",
      disposition: "completed",
      queue_id: 3,
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);

    const mod = await import("../app/routes/api.questions");
    const res = await mod.action({
      request: new Request("http://localhost/api/questions", { method: "POST" }),
    } as any);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: updateError });
    expect(mocks.logger.error).toHaveBeenCalled();
  });
});

