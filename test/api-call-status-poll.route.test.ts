import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    verifyAuth: vi.fn(),
    createClient: vi.fn(),
    createWorkspaceTwilioInstance: vi.fn(),
    requireWorkspaceAccess: vi.fn(),
    normalizeProviderStatus: vi.fn(),
    logger: {
      debug: vi.fn(),
      error: vi.fn(),
    },
  };
});

vi.mock("@/lib/supabase.server", () => ({ verifyAuth: (...args: any[]) => mocks.verifyAuth(...args) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: (...args: any[]) => mocks.createClient(...args) }));
vi.mock("@/lib/database.server", () => ({
  createWorkspaceTwilioInstance: (...args: any[]) => mocks.createWorkspaceTwilioInstance(...args),
  requireWorkspaceAccess: (...args: any[]) => mocks.requireWorkspaceAccess(...args),
}));
vi.mock("@/lib/call-status", () => ({
  normalizeProviderStatus: (...args: any[]) => mocks.normalizeProviderStatus(...args),
}));
vi.mock("@/lib/env.server", () => {
  return {
    env: new Proxy(
      {},
      {
        get: (_t, prop: string) => {
          if (prop === "SUPABASE_URL") return () => "https://sb.example";
          if (prop === "SUPABASE_SERVICE_KEY") return () => "svc";
          return () => "test";
        },
      },
    ),
  };
});
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

function makeUserSupabase({ membership }: { membership: any | null }) {
  const maybeSingle = vi.fn(async () => ({ data: membership, error: null }));
  const chain: any = { select: () => chain, eq: () => chain, maybeSingle };
  return { from: () => chain, maybeSingle };
}

function makeServiceSupabase(opts: {
  callSingle: { data: any; error: any };
  updateCallError?: any;
  updateAttemptError?: any;
}) {
  const callSingle = vi.fn(async () => opts.callSingle);
  const updateCall = vi.fn(async () => ({ error: opts.updateCallError ?? null }));
  const updateAttempt = vi.fn(async () => ({ error: opts.updateAttemptError ?? null }));

  return {
    from: (table: string) => {
      if (table === "call") {
        return {
          select: () => ({ eq: () => ({ single: callSingle }) }),
          update: (_data: any) => ({ eq: updateCall }),
        };
      }
      if (table === "outreach_attempt") {
        return { update: () => ({ eq: updateAttempt }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
    callSingle,
    updateCall,
    updateAttempt,
  };
}

describe("app/routes/api.call-status-poll.tsx", () => {
  beforeEach(() => {
    mocks.verifyAuth.mockReset();
    mocks.createClient.mockReset();
    mocks.createWorkspaceTwilioInstance.mockReset();
    mocks.requireWorkspaceAccess.mockReset();
    mocks.normalizeProviderStatus.mockReset();
    mocks.logger.debug.mockReset();
    mocks.logger.error.mockReset();
    mocks.requireWorkspaceAccess.mockResolvedValue(undefined);
    vi.resetModules();
  });

  test("returns 401 when verifyAuth returns no user", async () => {
    const userSupabase = makeUserSupabase({ membership: { id: "w1" } });
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: userSupabase,
      headers: new Headers(),
      user: null,
    });
    const mod = await import("../app/routing/api/api.call-status-poll");
    const res = await mod.loader({ request: new Request("http://localhost/api/call-status-poll") } as any);
    expect(res.status).toBe(401);
  }, 30000);

  test("returns 400 when callSid/workspaceId missing", async () => {
    const userSupabase = makeUserSupabase({ membership: { id: "w1" } });
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: userSupabase,
      headers: new Headers(),
      user: { id: "u1" },
    });
    const mod = await import("../app/routing/api/api.call-status-poll");
    const res = await mod.loader({ request: new Request("http://localhost/api/call-status-poll?callSid=CA") } as any);
    expect(res.status).toBe(400);
  }, 30000);

  test("returns 404 when call not found and logs debug", async () => {
    const userSupabase = makeUserSupabase({ membership: { id: "w1" } });
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: userSupabase,
      headers: new Headers(),
      user: { id: "u1" },
    });

    const svc = makeServiceSupabase({ callSingle: { data: null, error: null } });
    mocks.createClient.mockReturnValueOnce(svc);

    const mod = await import("../app/routing/api/api.call-status-poll");
    const res = await mod.loader({
      request: new Request("http://localhost/api/call-status-poll?callSid=CA&workspaceId=w1"),
    } as any);
    expect(res.status).toBe(404);
    expect(mocks.logger.debug).toHaveBeenCalled();
  }, 30000);

  test("returns 403 for workspace mismatch or missing membership", async () => {
    const userSupabase = makeUserSupabase({ membership: null });
    mocks.requireWorkspaceAccess.mockResolvedValue(undefined);
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: userSupabase,
      headers: new Headers(),
      user: { id: "u1" },
    });
    const svc = makeServiceSupabase({
      callSingle: { data: { workspace: "w2", status: null }, error: null },
    });
    mocks.createClient.mockReturnValueOnce(svc);

    const mod = await import("../app/routing/api/api.call-status-poll");

    const resMismatch = await mod.loader({
      request: new Request("http://localhost/api/call-status-poll?callSid=CA&workspaceId=w1"),
    } as any);
    expect(resMismatch.status).toBe(403);

    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: userSupabase,
      headers: new Headers(),
      user: { id: "u1" },
    });
    const { AppError, ErrorCode } = await import("../app/lib/errors.server");
    mocks.requireWorkspaceAccess.mockRejectedValueOnce(
      new AppError("Access denied to workspace", 403, ErrorCode.FORBIDDEN),
    );
    const svc2 = makeServiceSupabase({
      callSingle: { data: { workspace: "w1", status: null }, error: null },
    });
    mocks.createClient.mockReturnValueOnce(svc2);
    const resNoMembership = await mod.loader({
      request: new Request("http://localhost/api/call-status-poll?callSid=CA&workspaceId=w1"),
    } as any);
    expect(resNoMembership.status).toBe(403);
  }, 30000);

  test("returns 200 unsupported status when normalizeProviderStatus returns null", async () => {
    const userSupabase = makeUserSupabase({ membership: { id: "w1" } });
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: userSupabase,
      headers: new Headers(),
      user: { id: "u1" },
    });
    const svc = makeServiceSupabase({
      callSingle: { data: { workspace: "w1", status: null }, error: null },
    });
    mocks.createClient.mockReturnValueOnce(svc);

    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({ fetch: async () => ({ status: undefined }) }),
    });
    mocks.normalizeProviderStatus.mockReturnValueOnce(null);

    const mod = await import("../app/routing/api/api.call-status-poll");
    const res = await mod.loader({
      request: new Request("http://localhost/api/call-status-poll?callSid=CA&workspaceId=w1"),
    } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: undefined, error: "Unsupported status" });
  }, 30000);

  test("no DB update when status unchanged", async () => {
    const userSupabase = makeUserSupabase({ membership: { id: "w1" } });
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: userSupabase,
      headers: new Headers(),
      user: { id: "u1" },
    });
    const svc = makeServiceSupabase({
      callSingle: { data: { workspace: "w1", status: "completed", outreach_attempt_id: null }, error: null },
    });
    mocks.createClient.mockReturnValueOnce(svc);

    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({ fetch: async () => ({ status: "completed" }) }),
    });
    mocks.normalizeProviderStatus.mockReturnValueOnce("completed");

    const mod = await import("../app/routing/api/api.call-status-poll");
    const res = await mod.loader({
      request: new Request("http://localhost/api/call-status-poll?callSid=CA&workspaceId=w1"),
    } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "completed" });
    expect(svc.updateCall).not.toHaveBeenCalled();
  }, 30000);

  test("status changed updates call (covers endTime/duration true branch) and returns 500 on update error", async () => {
    const userSupabase = makeUserSupabase({ membership: { id: "w1" } });
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: userSupabase,
      headers: new Headers(),
      user: { id: "u1" },
    });
    const svc = makeServiceSupabase({
      callSingle: { data: { workspace: "w1", status: "queued", outreach_attempt_id: null }, error: null },
      updateCallError: new Error("u"),
    });
    mocks.createClient.mockReturnValueOnce(svc);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({
        fetch: async () => ({ status: "completed", endTime: new Date(0), duration: 12 }),
      }),
    });
    mocks.normalizeProviderStatus.mockReturnValueOnce("completed");

    const mod = await import("../app/routing/api/api.call-status-poll");
    const res = await mod.loader({
      request: new Request("http://localhost/api/call-status-poll?callSid=CA&workspaceId=w1"),
    } as any);
    expect(res.status).toBe(500);
    expect(mocks.logger.error).toHaveBeenCalled();
  }, 30000);

  test("status changed updates call (covers endTime/duration false branch) and logs attempt update error", async () => {
    const userSupabase = makeUserSupabase({ membership: { id: "w1" } });
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: userSupabase,
      headers: new Headers(),
      user: { id: "u1" },
    });
    const svc = makeServiceSupabase({
      callSingle: { data: { workspace: "w1", status: "queued", outreach_attempt_id: 1 }, error: null },
      updateAttemptError: new Error("a"),
    });
    mocks.createClient.mockReturnValueOnce(svc);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({
        fetch: async () => ({ status: "completed", endTime: null, duration: null }),
      }),
    });
    mocks.normalizeProviderStatus.mockReturnValueOnce("completed");

    const mod = await import("../app/routing/api/api.call-status-poll");
    const res = await mod.loader({
      request: new Request("http://localhost/api/call-status-poll?callSid=CA&workspaceId=w1"),
    } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "completed" });
    expect(svc.updateCall).toHaveBeenCalled();
    expect(mocks.logger.error).toHaveBeenCalled(); // attempt update error is logged
  }, 30000);

  test("status changed with null db status updates call and skips outreach_attempt update when no attempt id", async () => {
    const userSupabase = makeUserSupabase({ membership: { id: "w1" } });
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: userSupabase,
      headers: new Headers(),
      user: { id: "u1" },
    });
    const svc = makeServiceSupabase({
      callSingle: { data: { workspace: "w1", status: null, outreach_attempt_id: null }, error: null },
    });
    mocks.createClient.mockReturnValueOnce(svc);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({ fetch: async () => ({ status: "completed", endTime: null, duration: null }) }),
    });
    mocks.normalizeProviderStatus.mockReturnValueOnce("completed");

    const mod = await import("../app/routing/api/api.call-status-poll");
    const res = await mod.loader({
      request: new Request("http://localhost/api/call-status-poll?callSid=CA&workspaceId=w1"),
    } as any);
    expect(res.status).toBe(200);
    expect(svc.updateAttempt).not.toHaveBeenCalled();
  }, 30000);

  test("status changed updates outreach_attempt when attempt id present and no update error", async () => {
    const userSupabase = makeUserSupabase({ membership: { id: "w1" } });
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: userSupabase,
      headers: new Headers(),
      user: { id: "u1" },
    });
    const svc = makeServiceSupabase({
      callSingle: { data: { workspace: "w1", status: "queued", outreach_attempt_id: 1 }, error: null },
      updateAttemptError: null,
    });
    mocks.createClient.mockReturnValueOnce(svc);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({ fetch: async () => ({ status: "completed", endTime: null, duration: null }) }),
    });
    mocks.normalizeProviderStatus.mockReturnValueOnce("completed");

    const mod = await import("../app/routing/api/api.call-status-poll");
    const res = await mod.loader({
      request: new Request("http://localhost/api/call-status-poll?callSid=CA&workspaceId=w1"),
    } as any);
    expect(res.status).toBe(200);
    expect(svc.updateAttempt).toHaveBeenCalled();
  }, 30000);

  test("catch block returns 500 and formats error message for Error vs non-Error", async () => {
    const userSupabase = makeUserSupabase({ membership: { id: "w1" } });
    const svc = makeServiceSupabase({
      callSingle: { data: { workspace: "w1", status: null, outreach_attempt_id: null }, error: null },
    });
    mocks.createClient.mockReturnValue(svc);

    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: userSupabase,
      headers: new Headers(),
      user: { id: "u1" },
    });
    mocks.createWorkspaceTwilioInstance.mockRejectedValueOnce("nope");
    const mod = await import("../app/routing/api/api.call-status-poll");
    const r1 = await mod.loader({
      request: new Request("http://localhost/api/call-status-poll?callSid=CA&workspaceId=w1"),
    } as any);
    expect(r1.status).toBe(500);
    await expect(r1.json()).resolves.toEqual({
      error: "Failed to fetch call status",
      code: "INTERNAL_SERVER_ERROR",
      statusCode: 500,
    });

    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: userSupabase,
      headers: new Headers(),
      user: { id: "u1" },
    });
    mocks.createWorkspaceTwilioInstance.mockRejectedValueOnce(new Error("boom"));
    const r2 = await mod.loader({
      request: new Request("http://localhost/api/call-status-poll?callSid=CA&workspaceId=w1"),
    } as any);
    await expect(r2.json()).resolves.toEqual({
      error: "boom",
      code: "INTERNAL_SERVER_ERROR",
      statusCode: 500,
    });
  }, 30000);
});

