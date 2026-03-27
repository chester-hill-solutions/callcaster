import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    createClient: vi.fn(),
    createWorkspaceTwilioInstance: vi.fn(),
    safeParseJson: vi.fn(),
    logger: { debug: vi.fn(), error: vi.fn() },
    env: {
      SUPABASE_URL: () => "https://sb.example",
      SUPABASE_SERVICE_KEY: () => "svc",
      BASE_URL: () => "https://base.example",
    },
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: any[]) => mocks.createClient(...args),
}));

vi.mock("../app/lib/database.server", () => ({
  createWorkspaceTwilioInstance: (...args: any[]) => mocks.createWorkspaceTwilioInstance(...args),
  safeParseJson: (...args: any[]) => mocks.safeParseJson(...args),
}));

vi.mock("../app/lib/env.server", () => ({ env: mocks.env }));
vi.mock("../app/lib/logger.server", () => ({ logger: mocks.logger }));

function makeSupabase() {
  const channel = vi.fn(() => ({ send: vi.fn() }));
  const removeChannel = vi.fn();

  const rpc = vi.fn();
  const from = vi.fn();

  return { channel, removeChannel, rpc, from };
}

describe("app/routes/api.auto-dial.dialer.tsx", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    mocks.createWorkspaceTwilioInstance.mockReset();
    mocks.safeParseJson.mockReset();
    mocks.logger.debug.mockReset();
    mocks.logger.error.mockReset();
    vi.resetModules();
  });

  test("happy path: gets contact, creates attempt + twilio call, dequeues, saves call, returns success", async () => {
    const supabase = makeSupabase();

    supabase.rpc.mockImplementation(async (fn: string) => {
      if (fn === "auto_dial_queue") {
        return {
          data: [
            {
              queue_id: 1,
              contact_id: 2,
              contact_phone: "(555) 555-0100",
              caller_id: "+15551234567",
            },
          ],
          error: null,
        };
      }
      if (fn === "create_outreach_attempt") return { data: 99, error: null };
      if (fn === "dequeue_contact") return { data: {}, error: null };
      throw new Error(`unexpected rpc ${fn}`);
    });

    const upsertSelect = vi.fn(async () => ({ error: null }));
    supabase.from.mockImplementation((table: string) => {
      if (table === "call") return { upsert: () => ({ select: upsertSelect }) };
      throw new Error(`unexpected table ${table}`);
    });

    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.safeParseJson.mockResolvedValueOnce({
      user_id: "u1",
      campaign_id: 1,
      workspace_id: "w1",
      selected_device: "computer",
    });

    const twilioCallsCreate = vi.fn(async () => ({
      sid: "CA1",
      from: "+15551234567",
      status: "queued",
      dateUpdated: new Date(0),
    }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: { create: twilioCallsCreate },
      conferences: Object.assign((_sid: string) => ({ update: vi.fn() }), { list: vi.fn(async () => []) }),
    });

    const mod = await import("../app/lib/api-auto-dial-dialer.server");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/dialer", { method: "POST" }),
    } as any);

    expect(res).toBeInstanceOf(Response);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(twilioCallsCreate).toHaveBeenCalled();
    expect(upsertSelect).toHaveBeenCalled();
    expect(supabase.removeChannel).toHaveBeenCalled();
  });

  test("saves call: logs and continues when sid is missing", async () => {
    const supabase = makeSupabase();
    supabase.rpc.mockImplementation(async (fn: string) => {
      if (fn === "auto_dial_queue") {
        return {
          data: [{ queue_id: 1, contact_id: 2, contact_phone: "5555550100", caller_id: "+1555" }],
          error: null,
        };
      }
      if (fn === "create_outreach_attempt") return { data: 1, error: null };
      if (fn === "dequeue_contact") return { data: {}, error: null };
      throw new Error(`unexpected rpc ${fn}`);
    });
    supabase.from.mockImplementation((table: string) => {
      if (table === "call") return { upsert: () => ({ select: async () => ({ error: null }) }) };
      throw new Error(`unexpected table ${table}`);
    });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.safeParseJson.mockResolvedValueOnce({
      user_id: "u1",
      campaign_id: 1,
      workspace_id: "w1",
      selected_device: "computer",
    });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: { create: async () => ({ sid: undefined }) },
      conferences: Object.assign((_sid: string) => ({ update: vi.fn() }), { list: vi.fn(async () => []) }),
    });

    const mod = await import("../app/lib/api-auto-dial-dialer.server");
    const res = await mod.action({ request: new Request("http://localhost/x", { method: "POST" }) } as any);
    await res.json();
    expect(mocks.logger.error).toHaveBeenCalledWith("Cannot save call without sid");
  });

  test("no queued contacts: completes conferences and returns message", async () => {
    const supabase = makeSupabase();
    supabase.rpc.mockResolvedValueOnce({ data: [], error: null }); // auto_dial_queue
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.safeParseJson.mockResolvedValueOnce({
      user_id: "u1",
      campaign_id: 1,
      workspace_id: "w1",
      selected_device: "computer",
    });

    const confUpdate = vi.fn(async () => ({}));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      conferences: Object.assign(
        (_sid: string) => ({ update: confUpdate }),
        { list: vi.fn(async () => [{ sid: "CONF1" }, { sid: "CONF2" }]) },
      ),
    });

    const mod = await import("../app/lib/api-auto-dial-dialer.server");
    const res = await mod.action({ request: new Request("http://localhost/x", { method: "POST" }) } as any);
    await expect(res.json()).resolves.toEqual({ success: true, message: "No queued contacts" });
    expect(confUpdate).toHaveBeenCalled();
  });

  test("returns 500-style JSON response when dequeue_contact rpc errors", async () => {
    const supabase = makeSupabase();

    supabase.rpc.mockImplementation(async (fn: string) => {
      if (fn === "auto_dial_queue") {
        return { data: [{ queue_id: 1, contact_id: 2, contact_phone: "5555550100", caller_id: "+1555" }], error: null };
      }
      if (fn === "create_outreach_attempt") return { data: 1, error: null };
      if (fn === "dequeue_contact") return { data: null, error: new Error("dq") };
      throw new Error(`unexpected rpc ${fn}`);
    });
    supabase.from.mockImplementation((table: string) => {
      if (table === "call") return { upsert: () => ({ select: async () => ({ error: null }) }) };
      throw new Error(`unexpected table ${table}`);
    });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.safeParseJson.mockResolvedValueOnce({
      user_id: "u1",
      campaign_id: 1,
      workspace_id: "w1",
      selected_device: "computer",
    });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: { create: async () => ({ sid: "CA1", from: "+1555" }) },
      conferences: Object.assign((_sid: string) => ({ update: vi.fn() }), { list: vi.fn(async () => []) }),
    });

    const mod = await import("../app/lib/api-auto-dial-dialer.server");
    const res = await mod.action({ request: new Request("http://localhost/x", { method: "POST" }) } as any);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    await expect(res.json()).resolves.toEqual({ success: false, error: "dq" });
  });

  test("error formatting: non-Error thrown becomes Unknown error", async () => {
    const supabase = makeSupabase();
    supabase.rpc.mockRejectedValueOnce("nope");
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.safeParseJson.mockResolvedValueOnce({
      user_id: "u1",
      campaign_id: 1,
      workspace_id: "w1",
      selected_device: "computer",
    });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ conferences: { list: async () => [] } });

    const mod = await import("../app/lib/api-auto-dial-dialer.server");
    const res = await mod.action({ request: new Request("http://localhost/x", { method: "POST" }) } as any);
    await expect(res.json()).resolves.toEqual({ success: false, error: "Unknown error" });
  });

  test("normalizePhoneNumber throws invalid length (covered by catch)", async () => {
    const supabase = makeSupabase();
    supabase.rpc.mockResolvedValueOnce({
      data: [{ queue_id: 1, contact_id: 2, contact_phone: "+123", caller_id: "+1555" }],
      error: null,
    });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.safeParseJson.mockResolvedValueOnce({
      user_id: "u1",
      campaign_id: 1,
      workspace_id: "w1",
      selected_device: "computer",
    });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ conferences: { list: async () => [] } });

    const mod = await import("../app/lib/api-auto-dial-dialer.server");
    const res = await mod.action({ request: new Request("http://localhost/x", { method: "POST" }) } as any);
    await expect(res.json()).resolves.toEqual({ success: false, error: "Invalid phone number length" });
  });

  test("helper exports cover remaining branches (normalization, rpc throws, and call persistence shaping)", async () => {
    const mod = await import("../app/lib/api-auto-dial-dialer.server");

    // normalizePhoneNumber: + in middle triggers plus removal and minLength else-path
    expect(mod.normalizePhoneNumber("1+5555550100")).toBe("+15555550100");

    // getNextContact: throws when rpc returns error
    await expect(
      mod.getNextContact(
        {
          rpc: async () => ({ data: [], error: new Error("q") }),
        } as any,
        1,
        "u1",
      ),
    ).rejects.toThrow("q");

    // createOutreachAttempt: throws when rpc returns error
    await expect(
      mod.createOutreachAttempt(
        {
          rpc: async () => ({ data: null, error: new Error("oa") }),
        } as any,
        { queue_id: 1, contact_id: 2, contact_phone: "+15555550100" },
        1,
        "w1",
        "u1",
      ),
    ).rejects.toThrow("oa");

    // saveCallToDatabase: shapes optional fields and logs on upsert error
    const upsertSelect = vi.fn(async () => ({ error: new Error("ins") }));
    await mod.saveCallToDatabase(
      {
        from: () => ({ upsert: () => ({ select: upsertSelect }) }),
      } as any,
      {
        sid: "CA1",
        to: "",
        from: "",
        status: "",
        start_time: "2020-01-01T00:00:00.000Z",
        end_time: "2020-01-01T00:00:00.000Z",
        duration: 5 as any,
        price: 0.5 as any,
        campaign_id: 0 as any,
        contact_id: 0 as any,
        workspace: "",
        outreach_attempt_id: 0 as any,
        conference_id: "",
      } as any,
    );
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Error saving the call to the database:",
      expect.any(Error),
    );
  });
});

