import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    verifyAuth: vi.fn(),
    parseActionRequest: vi.fn(),
    createWorkspaceTwilioInstance: vi.fn(),
    requireWorkspaceAccess: vi.fn(),
    logger: { error: vi.fn() },
  };
});

vi.mock("@/lib/supabase.server", () => ({
  verifyAuth: (...args: any[]) => mocks.verifyAuth(...args),
}));
vi.mock("../app/lib/database.server", () => ({
  parseActionRequest: (...args: any[]) => mocks.parseActionRequest(...args),
  createWorkspaceTwilioInstance: (...args: any[]) => mocks.createWorkspaceTwilioInstance(...args),
  requireWorkspaceAccess: (...args: any[]) => mocks.requireWorkspaceAccess(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

function makeSupabase(options?: {
  queueError?: any;
  rpcError?: any;
  outreachError?: any;
  queueRows?: any[];
  callRecord?: { conference_id: string | null } | null;
}) {
  const realtimeSend = vi.fn();
  const removeChannel = vi.fn();
  const channelObj = { send: realtimeSend };

  const supabase: any = {
    realtime: { channel: (_id: string) => channelObj },
    removeChannel,
    from: (table: string) => {
      if (table === "call") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: options?.callRecord ?? null,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "campaign_queue") {
        return {
          select: () => ({
            is: async () => ({
              data:
                options?.queueRows ??
                [
                  {
                    contact_id: 2,
                    status: "u1",
                    assigned_to_user_id: "u1",
                    dequeued_at: null,
                    campaign: { group_household_queue: true },
                  },
                ],
              error: options?.queueError ?? null,
            }),
          }),
        };
      }
      if (table === "outreach_attempt") {
        return {
          update: () => ({
            eq: () => ({
              eq: async () => ({
                data: [],
                error: options?.outreachError ?? null,
              }),
            }),
          }),
        };
      }
      throw new Error("unexpected table");
    },
    rpc: async (_name: string, _args: any) => ({
      data: {},
      error: options?.rpcError ?? null,
    }),
  };

  return { supabase, realtimeSend, removeChannel };
}

describe("app/routes/api.hangup.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyAuth.mockReset();
    mocks.parseActionRequest.mockReset();
    mocks.createWorkspaceTwilioInstance.mockReset();
    mocks.requireWorkspaceAccess.mockReset();
    mocks.logger.error.mockReset();
  });

  test("hangs up, broadcasts idle, dequeues, updates outreach, removes channel", async () => {
    const { supabase, realtimeSend, removeChannel } = makeSupabase();
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: supabase, user: { id: "u1" } });
    mocks.parseActionRequest.mockResolvedValueOnce({
      conference_id: "conf",
      workspaceId: "w1",
      callSid: "CA1",
    });
    const callUpdate = vi.fn(async () => ({}));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: (_sid: string) => ({ update: callUpdate }) });

    const mod = await import("../app/routes/api.hangup");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(realtimeSend).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ status: "idle" }) }),
    );
    expect(removeChannel).toHaveBeenCalled();
  });

  test("returns 200 when Twilio returns 21220 (call already ended)", async () => {
    const { supabase, realtimeSend } = makeSupabase();
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: supabase, user: { id: "u1" } });
    mocks.parseActionRequest.mockResolvedValueOnce({ conference_id: "c", workspaceId: "w1", callSid: "CA1" });
    const err21220 = new Error("Call is not in-progress. Cannot redirect.") as Error & { code: number };
    err21220.code = 21220;
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({
        update: async () => {
          throw err21220;
        },
      }),
    });
    const mod = await import("../app/routes/api.hangup");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(realtimeSend).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ status: "idle" }) }),
    );
  });

  test("returns 500 when Twilio throws non-21220", async () => {
    const { supabase } = makeSupabase();
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: supabase, user: { id: "u1" } });
    mocks.parseActionRequest.mockResolvedValueOnce({ conference_id: "c", workspaceId: "w1", callSid: "CA1" });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({
        update: async () => {
          throw new Error("Call is not in-progress");
        },
      }),
    });
    const mod = await import("../app/routes/api.hangup");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(500);
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  test("returns 200 when no queue entry (handset mode)", async () => {
    const { supabase } = makeSupabase({ queueRows: [] });
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: supabase, user: { id: "u1" } });
    mocks.parseActionRequest.mockResolvedValueOnce({ conference_id: "conf", workspaceId: "w1", callSid: "CA1" });
    const callUpdate = vi.fn(async () => ({}));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: (_sid: string) => ({ update: callUpdate }) });
    const mod = await import("../app/routes/api.hangup");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
  });

  test("outreach update error is thrown and returns 500", async () => {
    const { supabase } = makeSupabase({ outreachError: new Error("outreach") });
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: supabase, user: { id: "u1" } });
    mocks.parseActionRequest.mockResolvedValueOnce({ conference_id: "c", workspaceId: "w1", callSid: "CA1" });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });
    const mod = await import("../app/routes/api.hangup");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(500);
  });
});

