import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    createSupabaseServerClient: vi.fn(),
    verifyAuth: vi.fn(),
    safeParseJson: vi.fn(),
    requireWorkspaceAccess: vi.fn(),
    createWorkspaceTwilioInstance: vi.fn(),
    logger: { error: vi.fn() },
    env: { BASE_URL: () => "https://base.example" },
  };
});

vi.mock("../app/lib/supabase.server", () => ({
  createSupabaseServerClient: (...args: any[]) => mocks.createSupabaseServerClient(...args),
  verifyAuth: (...args: any[]) => mocks.verifyAuth(...args),
}));
vi.mock("../app/lib/database.server", () => ({
  safeParseJson: (...args: any[]) => mocks.safeParseJson(...args),
  requireWorkspaceAccess: (...args: any[]) => mocks.requireWorkspaceAccess(...args),
  createWorkspaceTwilioInstance: (...args: any[]) => mocks.createWorkspaceTwilioInstance(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));

vi.mock("twilio", () => {
  class VoiceResponse {
    private said: string[] = [];
    say(t: string) {
      this.said.push(t);
    }
    toString() {
      return `<Response>${this.said.map((s) => `<Say>${s}</Say>`).join("")}</Response>`;
    }
  }
  return { default: { twiml: { VoiceResponse } } };
});

function makeSupabaseStub(credits: number) {
  const upsert = vi.fn(async () => ({ error: null }));
  const rpc = vi.fn(async () => ({ data: 77, error: null }));
  const supabase: any = {
    from: (table: string) => {
      if (table === "workspace") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { credits }, error: null }),
            }),
          }),
        };
      }
      if (table === "call") {
        return { upsert };
      }
      throw new Error("unexpected table");
    },
    rpc,
  };
  return { supabase, upsert, rpc };
}

describe("app/routes/api.dial.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createSupabaseServerClient.mockReset();
    mocks.verifyAuth.mockReset();
    mocks.safeParseJson.mockReset();
    mocks.requireWorkspaceAccess.mockReset();
    mocks.createWorkspaceTwilioInstance.mockReset();
    mocks.logger.error.mockReset();
  });

  test("throws 401 Response when user missing", async () => {
    const { supabase } = makeSupabaseStub(10);
    mocks.createSupabaseServerClient.mockReturnValueOnce({ supabaseClient: supabase, headers: new Headers() });
    mocks.safeParseJson.mockResolvedValueOnce({
      to_number: "+15550001111",
      user_id: "u1",
      campaign_id: "1",
      contact_id: "2",
      workspace_id: "w1",
      queue_id: "3",
      caller_id: "+1555",
    });
    mocks.verifyAuth.mockResolvedValueOnce({ user: null });

    const mod = await import("../app/routes/api.dial");
    await expect(
      mod.action({ request: new Request("http://localhost/api/dial", { method: "POST" }) } as any),
    ).rejects.toMatchObject({ status: 401 });
  });

  test("returns creditsError when credits <= 0", async () => {
    const { supabase } = makeSupabaseStub(0);
    mocks.createSupabaseServerClient.mockReturnValueOnce({ supabaseClient: supabase, headers: new Headers() });
    mocks.safeParseJson.mockResolvedValueOnce({
      to_number: "+15550001111",
      user_id: "u1",
      campaign_id: "1",
      contact_id: "2",
      workspace_id: "w1",
      queue_id: "3",
      caller_id: "+1555",
    });
    mocks.verifyAuth.mockResolvedValueOnce({ user: { id: "u1" } });

    const mod = await import("../app/routes/api.dial");
    const res = await mod.action({ request: new Request("http://localhost/api/dial", { method: "POST" }) } as any);
    expect(res).toEqual({ creditsError: true });
  });

  test("happy path uses outreach_id when provided and upserts call", async () => {
    const { supabase, rpc, upsert } = makeSupabaseStub(10);
    mocks.createSupabaseServerClient.mockReturnValueOnce({ supabaseClient: supabase, headers: new Headers() });
    mocks.safeParseJson.mockResolvedValueOnce({
      to_number: "1+5555550100",
      user_id: "u1",
      campaign_id: "1",
      contact_id: "2",
      workspace_id: "w1",
      queue_id: "3",
      outreach_id: "oa1",
      caller_id: "+1555",
      selected_device: "computer",
    });
    mocks.verifyAuth.mockResolvedValueOnce({ user: { id: "u1" } });
    const callsCreate = vi.fn(async () => ({ sid: "CA1", from: "+1555" }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: { create: callsCreate } });

    const mod = await import("../app/routes/api.dial");
    const res = await mod.action({ request: new Request("http://localhost/api/dial", { method: "POST" }) } as any);
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    expect(rpc).not.toHaveBeenCalled(); // outreach_id provided
    expect(upsert).toHaveBeenCalled();
    expect(callsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining("/api/dial/%2B15555550100"),
      }),
    );
  });

  test("creates outreach attempt when outreach_id missing", async () => {
    const { supabase, rpc } = makeSupabaseStub(10);
    mocks.createSupabaseServerClient.mockReturnValueOnce({ supabaseClient: supabase, headers: new Headers() });
    mocks.safeParseJson.mockResolvedValueOnce({
      to_number: "+15555550100",
      user_id: "u1",
      campaign_id: "1",
      contact_id: "2",
      workspace_id: "w1",
      queue_id: "3",
      caller_id: "+1555",
      selected_device: "+15550001111",
    });
    mocks.verifyAuth.mockResolvedValueOnce({ user: { id: "u1" } });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: { create: async () => ({ sid: "CA1", from: "+1555" }) } });

    const mod = await import("../app/routes/api.dial");
    const res = await mod.action({ request: new Request("http://localhost/api/dial", { method: "POST" }) } as any);
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    expect(rpc).toHaveBeenCalledWith("create_outreach_attempt", expect.any(Object));
  });

  test("invalid phone number throws before calling Twilio", async () => {
    const { supabase } = makeSupabaseStub(10);
    mocks.createSupabaseServerClient.mockReturnValueOnce({ supabaseClient: supabase, headers: new Headers() });
    mocks.safeParseJson.mockResolvedValueOnce({
      to_number: "+123",
      user_id: "u1",
      campaign_id: "1",
      contact_id: "2",
      workspace_id: "w1",
      queue_id: "3",
      caller_id: "+1555",
    });
    mocks.verifyAuth.mockResolvedValueOnce({ user: { id: "u1" } });
    await expect(
      (await import("../app/routes/api.dial")).action({
        request: new Request("http://localhost/api/dial", { method: "POST" }),
      } as any),
    ).rejects.toThrow("Invalid phone number length");
  });

  test("call create error logs and says message", async () => {
    const { supabase } = makeSupabaseStub(10);
    mocks.createSupabaseServerClient.mockReturnValueOnce({ supabaseClient: supabase, headers: new Headers() });
    mocks.safeParseJson.mockResolvedValueOnce({
      to_number: "+15555550100",
      user_id: "u1",
      campaign_id: "1",
      contact_id: "2",
      workspace_id: "w1",
      queue_id: "3",
      caller_id: "+1555",
    });
    mocks.verifyAuth.mockResolvedValueOnce({ user: { id: "u1" } });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: { create: async () => Promise.reject(new Error("tw")) },
    });

    const mod = await import("../app/routes/api.dial");
    const res = await mod.action({ request: new Request("http://localhost/api/dial", { method: "POST" }) } as any);
    const xml = await res.text();
    expect(xml).toContain("There was an error placing your call");
    expect(mocks.logger.error).toHaveBeenCalledWith("Error placing call:", expect.any(Error));
  });

  test("throws when workspace credits query errors", async () => {
    const supabase: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: new Error("db") }),
          }),
        }),
      }),
    };
    mocks.createSupabaseServerClient.mockReturnValueOnce({ supabaseClient: supabase, headers: new Headers() });
    mocks.safeParseJson.mockResolvedValueOnce({
      to_number: "+15555550100",
      user_id: "u1",
      campaign_id: "1",
      contact_id: "2",
      workspace_id: "w1",
      queue_id: "3",
      caller_id: "+1555",
    });
    mocks.verifyAuth.mockResolvedValueOnce({ user: { id: "u1" } });

    const mod = await import("../app/routes/api.dial");
    await expect(mod.action({ request: new Request("http://localhost/api/dial", { method: "POST" }) } as any)).rejects.toThrow("db");
  });

  test("throws when create_outreach_attempt rpc errors", async () => {
    const { supabase, rpc } = makeSupabaseStub(10);
    rpc.mockResolvedValueOnce({ data: null, error: new Error("rpc") });
    mocks.createSupabaseServerClient.mockReturnValueOnce({ supabaseClient: supabase, headers: new Headers() });
    mocks.safeParseJson.mockResolvedValueOnce({
      to_number: "+15555550100",
      user_id: "u1",
      campaign_id: "1",
      contact_id: "2",
      workspace_id: "w1",
      queue_id: "3",
      caller_id: "+1555",
    });
    mocks.verifyAuth.mockResolvedValueOnce({ user: { id: "u1" } });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: { create: async () => ({ sid: "CA1", from: "+1555" }) } });

    const mod = await import("../app/routes/api.dial");
    const res = await mod.action({ request: new Request("http://localhost/api/dial", { method: "POST" }) } as any);
    expect(await res.text()).toContain("There was an error placing your call");
  });

  test("logs when call upsert fails", async () => {
    const { supabase } = makeSupabaseStub(10);
    supabase.from = (table: string) => {
      if (table === "workspace") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { credits: 10 }, error: null }) }) }) };
      }
      if (table === "call") return { upsert: async () => ({ error: new Error("upsert") }) };
      throw new Error("unexpected");
    };
    mocks.createSupabaseServerClient.mockReturnValueOnce({ supabaseClient: supabase, headers: new Headers() });
    mocks.safeParseJson.mockResolvedValueOnce({
      to_number: "+15555550100",
      user_id: "u1",
      campaign_id: "1",
      contact_id: "2",
      workspace_id: "w1",
      queue_id: "3",
      outreach_id: "oa1",
      caller_id: "+1555",
    });
    mocks.verifyAuth.mockResolvedValueOnce({ user: { id: "u1" } });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: { create: async () => ({ sid: "CA1", from: "+1555" }) } });

    const mod = await import("../app/routes/api.dial");
    await mod.action({ request: new Request("http://localhost/api/dial", { method: "POST" }) } as any);
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Error saving the call to the database:",
      expect.any(Error),
    );
  });
});

