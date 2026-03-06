import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    createClient: vi.fn(),
    createWorkspaceTwilioInstance: vi.fn(),
    env: {
      SUPABASE_URL: () => "https://sb.example",
      SUPABASE_SERVICE_KEY: () => "svc",
      BASE_URL: () => "https://base.example",
    },
    logger: { error: vi.fn() },
  };
});

vi.mock("@supabase/supabase-js", () => ({ createClient: (...a: any[]) => mocks.createClient(...a) }));
vi.mock("../app/lib/database.server", () => ({
  createWorkspaceTwilioInstance: (...a: any[]) => mocks.createWorkspaceTwilioInstance(...a),
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

function makeSupabase(opts?: {
  outreachError?: any;
  insertError?: any;
  dequeueError?: any;
}) {
  const supabase: any = {
    rpc: async () => ({ data: 99, error: opts?.outreachError ?? null }),
    from: (table: string) => {
      if (table === "call") {
        return {
          insert: () => ({
            select: async () => ({ data: [], error: opts?.insertError ?? null }),
          }),
        };
      }
      if (table === "campaign_queue") {
        return {
          update: () => ({
            eq: async () => ({ data: [], error: opts?.dequeueError ?? null }),
          }),
        };
      }
      throw new Error("unexpected table");
    },
  };
  return supabase;
}

describe("app/routes/api.ivr.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.createWorkspaceTwilioInstance.mockReset();
    mocks.logger.error.mockReset();
  });

  test("throws when required form data missing", async () => {
    mocks.createClient.mockReturnValueOnce(makeSupabase());
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: { create: async () => ({ sid: "CA1" }) } });
    const mod = await import("../app/routes/api.ivr");
    const fd = new FormData();
    fd.set("to_number", "+1");
    await expect(mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any)).rejects.toThrow(
      "Missing required form data",
    );
  });

  test("success creates outreach, places call, inserts call, dequeues, returns JSON", async () => {
    mocks.createClient.mockReturnValueOnce(makeSupabase());
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: { create: async (_p: any) => ({ sid: "CA1" }) },
    });
    const mod = await import("../app/routes/api.ivr");
    const fd = new FormData();
    fd.set("to_number", "+1555");
    fd.set("campaign_id", "1");
    fd.set("workspace_id", "w1");
    fd.set("contact_id", "2");
    fd.set("caller_id", "+1666");
    fd.set("queue_id", "3");
    fd.set("user_id", "u1");
    const res = await mod.action({
      request: new Request("http://x", { method: "POST", body: fd }),
    } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, callSid: "CA1" });
  });

  test("returns 500 on errors (rpc/call insert/dequeue), with unknown error formatting", async () => {
    mocks.createClient.mockReturnValueOnce(makeSupabase({ outreachError: new Error("rpc") }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: { create: async () => ({ sid: "CA1" }) } });
    const mod = await import("../app/routes/api.ivr");
    const fd = new FormData();
    fd.set("to_number", "+1555");
    fd.set("campaign_id", "1");
    fd.set("workspace_id", "w1");
    fd.set("contact_id", "2");
    fd.set("caller_id", "+1666");
    fd.set("queue_id", "3");
    fd.set("user_id", "u1");
    let res = await mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any);
    expect(res.status).toBe(500);
    expect(await res.text()).toContain("rpc");

    mocks.createClient.mockReturnValueOnce(makeSupabase({ insertError: new Error("ins") }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: { create: async () => ({ sid: "CA1" }) } });
    res = await mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any);
    expect(res.status).toBe(500);

    mocks.createClient.mockReturnValueOnce(makeSupabase({ dequeueError: "nope" }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: { create: async () => ({ sid: "CA1" }) } });
    res = await mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any);
    expect(res.status).toBe(500);
    expect(await res.text()).toContain("Unknown error");
    expect(mocks.logger.error).toHaveBeenCalled();
  });
});

