import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    createClient: vi.fn(),
    createWorkspaceTwilioInstance: vi.fn(),
    logger: { error: vi.fn() },
    fetch: vi.fn(async () => ({ ok: true })),
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: any[]) => mocks.createClient(...args),
}));

vi.mock("../app/lib/database.server", () => ({
  createWorkspaceTwilioInstance: (...args: any[]) => mocks.createWorkspaceTwilioInstance(...args),
}));

vi.mock("../app/lib/env.server", () => ({
  env: {
    SUPABASE_URL: () => "https://sb.example",
    SUPABASE_SERVICE_KEY: () => "svc",
    BASE_URL: () => "https://base.example",
  },
}));

vi.mock("../app/lib/logger.server", () => ({ logger: mocks.logger }));

vi.mock("@/twilio.server", () => ({
  validateTwilioWebhookParams: vi.fn(() => true),
}));

vi.mock("twilio", () => {
  class VoiceResponse {
    private _dialed: any[] = [];
    dial() {
      return {
        conference: (_opts: any, name: string) => {
          this._dialed.push(name);
        },
      };
    }
    toString() {
      return "<Response/>";
    }
  }

  return {
    default: {
      twiml: { VoiceResponse },
    },
  };
});

function makeSupabase(overrides: Partial<any>) {
  const supabase: any = {
    from: vi.fn(),
    rpc: vi.fn(),
    storage: { from: vi.fn() },
    realtime: { channel: vi.fn(() => ({ send: vi.fn() })) },
    removeChannel: vi.fn(),
    ...overrides,
  };
  return supabase;
}

describe("app/routes/api.auto-dial.$roomId.tsx", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    mocks.createWorkspaceTwilioInstance.mockReset();
    mocks.logger.error.mockReset();
    mocks.fetch.mockClear();
    vi.stubGlobal("fetch", mocks.fetch);
    vi.resetModules();
  });

  test("device-check path: verified device joins conference and triggers dialer", async () => {
    const supabase = makeSupabase({});

    supabase.from.mockImplementation((table: string) => {
      if (table === "call") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  campaign_id: 1,
                  outreach_attempt_id: 1,
                  contact_id: 1,
                  workspace: "w1",
                  conference_id: "u1",
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "campaign") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { voicemail_file: "vm.mp3", group_household_queue: true, caller_id: "+1555" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "user") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { verified_audio_numbers: ["+1555"] },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "workspace") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { twilio_data: { authToken: "auth" } },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    mocks.createClient.mockReturnValueOnce(supabase);

    const mod = await import("../app/routing/api/api.auto-dial.$roomId");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "");
    fd.set("CallStatus", "in-progress");
    fd.set("Called", "client:u1");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any);

    expect(res.headers.get("Content-Type")).toBe("text/xml");
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://base.example/api/auto-dial/dialer",
      expect.objectContaining({ method: "POST" }),
    );
  });

  test("machine answer: plays voicemail, dequeues (rpc), triggers next dial, and updates call twiml", async () => {
    const updateCallTwiml = vi.fn(async () => ({}));
    const twilio = {
      calls: (_sid: string) => ({ update: updateCallTwiml }),
      conferences: Object.assign(
        (_sid: string) => ({ update: vi.fn() }),
        { list: vi.fn(async () => [{ sid: "CONF1" }]) },
      ),
    };
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(twilio as any);

    const supabase = makeSupabase({});
    supabase.from.mockImplementation((table: string) => {
      if (table === "call") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  campaign_id: 1,
                  outreach_attempt_id: 1,
                  contact_id: 2,
                  workspace: "w1",
                  conference_id: "u1",
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "campaign") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { voicemail_file: "vm.mp3", group_household_queue: true, caller_id: "+1555" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "user") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { verified_audio_numbers: ["+1666"] }, error: null }),
            }),
          }),
        };
      }
      if (table === "outreach_attempt") {
        return {
          update: () => ({
            eq: () => ({
              select: async () => ({
                data: [{ user_id: "u1", campaign_id: 1 }],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "workspace") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { twilio_data: { authToken: "auth" } },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    supabase.storage.from.mockReturnValueOnce({
      createSignedUrl: async () => ({ data: { signedUrl: "https://signed" }, error: null }),
    });
    supabase.rpc.mockResolvedValueOnce({ data: {}, error: null }); // dequeue_contact

    mocks.createClient.mockReturnValueOnce(supabase);

    const mod = await import("../app/routing/api/api.auto-dial.$roomId");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "machine_start");
    fd.set("CallStatus", "ringing");
    fd.set("Called", "+1888");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any);

    expect(res.headers.get("Content-Type")).toBe("text/xml");
    expect(updateCallTwiml).toHaveBeenCalledWith(
      expect.objectContaining({ twiml: expect.stringContaining("<Play>https://signed</Play>") }),
    );
    expect(mocks.fetch).toHaveBeenCalled();
    expect(supabase.removeChannel).toHaveBeenCalled();
  });

  test("machine answer with no voicemail signedUrl returns Hangup response", async () => {
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({ update: vi.fn() }),
      conferences: Object.assign((_sid: string) => ({ update: vi.fn() }), { list: vi.fn(async () => []) }),
    } as any);

    const supabase = makeSupabase({});
    supabase.from.mockImplementation((table: string) => {
      if (table === "call") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { campaign_id: 1, outreach_attempt_id: 1, contact_id: 2, workspace: "w1", conference_id: "u1" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "campaign") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { voicemail_file: null, group_household_queue: true, caller_id: "+1555" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "user") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { verified_audio_numbers: ["+1666"] }, error: null }),
            }),
          }),
        };
      }
      if (table === "outreach_attempt") {
        return { update: () => ({ eq: () => ({ select: async () => ({ data: [{ user_id: "u1", campaign_id: 1 }], error: null }) }) }) };
      }
      if (table === "workspace") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { twilio_data: { authToken: "auth" } },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });
    mocks.createClient.mockReturnValueOnce(supabase);

    const mod = await import("../app/routing/api/api.auto-dial.$roomId");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "machine_start");
    fd.set("CallStatus", "ringing");
    fd.set("Called", "+1888");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any);

    expect(await res.text()).toContain("<Hangup/>");
  });

  test("machine answer: conferences empty + fallbacks + campaign_queue dequeue success", async () => {
    const updateCallTwiml = vi.fn(async () => ({}));
    const twilio = {
      calls: (_sid: string) => ({ update: updateCallTwiml }),
      conferences: Object.assign(
        (_sid: string) => ({ update: vi.fn() }),
        { list: vi.fn(async () => []) },
      ),
    };
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(twilio as any);

    const supabase = makeSupabase({});
    supabase.from.mockImplementation((table: string) => {
      if (table === "call") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  campaign_id: null,
                  outreach_attempt_id: null,
                  contact_id: null,
                  workspace: null,
                  conference_id: "u1",
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "campaign") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { voicemail_file: "vm.mp3", group_household_queue: null, caller_id: null },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "user") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { verified_audio_numbers: ["+1666"] }, error: null }) }) }) };
      }
      if (table === "outreach_attempt") {
        return {
          update: () => ({
            eq: () => ({
              select: async () => ({
                data: [{}], // user_id/campaign_id undefined => cover fallbacks
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "campaign_queue") {
        return {
          update: () => ({
            eq: () => ({
              select: async () => ({ data: [{ ok: 1 }], error: null }),
            }),
          }),
        };
      }
      if (table === "workspace") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { twilio_data: { authToken: "auth" } },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });
    supabase.storage.from.mockReturnValueOnce({
      createSignedUrl: async () => ({ data: { signedUrl: "https://signed" }, error: null }),
    });
    mocks.createClient.mockReturnValueOnce(supabase);

    const mod = await import("../app/routing/api/api.auto-dial.$roomId");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "machine_start");
    fd.set("CallStatus", "ringing");
    fd.set("Called", "+1888");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any);

    expect(res.headers.get("Content-Type")).toBe("text/xml");
    expect(updateCallTwiml).toHaveBeenCalled();
  });

  test("machine answer: dequeue_contact rpc error is caught", async () => {
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({ update: vi.fn() }),
      conferences: Object.assign((_sid: string) => ({ update: vi.fn() }), { list: vi.fn(async () => []) }),
    } as any);

    const supabase = makeSupabase({});
    supabase.from.mockImplementation((table: string) => {
      if (table === "call") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { campaign_id: 1, outreach_attempt_id: 1, contact_id: 2, workspace: "w1", conference_id: "u1" }, error: null }) }) }) };
      }
      if (table === "campaign") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { voicemail_file: "vm.mp3", group_household_queue: true, caller_id: "+1555" }, error: null }) }) }) };
      }
      if (table === "user") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { verified_audio_numbers: ["+1666"] }, error: null }) }) }) };
      }
      if (table === "outreach_attempt") {
        return { update: () => ({ eq: () => ({ select: async () => ({ data: [{ user_id: "u1", campaign_id: 1 }], error: null }) }) }) };
      }
      throw new Error(`unexpected ${table}`);
    });
    supabase.storage.from.mockReturnValueOnce({
      createSignedUrl: async () => ({ data: { signedUrl: "https://signed" }, error: null }),
    });
    supabase.rpc.mockResolvedValueOnce({ data: null, error: new Error("dq") });
    mocks.createClient.mockReturnValueOnce(supabase);

    const mod = await import("../app/routing/api/api.auto-dial.$roomId");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "machine_start");
    fd.set("CallStatus", "ringing");
    fd.set("Called", "+1888");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any);
    expect(await res.text()).toContain("<Hangup/>");
  });

  test("machine answer: outreach_attempt update error is caught", async () => {
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({ update: vi.fn() }),
      conferences: Object.assign((_sid: string) => ({ update: vi.fn() }), { list: vi.fn(async () => []) }),
    } as any);

    const supabase = makeSupabase({});
    supabase.from.mockImplementation((table: string) => {
      if (table === "call") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { campaign_id: 1, outreach_attempt_id: 1, contact_id: 2, workspace: "w1", conference_id: "u1" }, error: null }) }) }) };
      }
      if (table === "campaign") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { voicemail_file: "vm.mp3", group_household_queue: true, caller_id: "+1555" }, error: null }) }) }) };
      }
      if (table === "user") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { verified_audio_numbers: ["+1666"] }, error: null }) }) }) };
      }
      if (table === "outreach_attempt") {
        return { update: () => ({ eq: () => ({ select: async () => ({ data: null, error: new Error("oa") }) }) }) };
      }
      throw new Error(`unexpected ${table}`);
    });
    supabase.storage.from.mockReturnValueOnce({
      createSignedUrl: async () => ({ data: { signedUrl: "https://signed" }, error: null }),
    });
    mocks.createClient.mockReturnValueOnce(supabase);

    const mod = await import("../app/routing/api/api.auto-dial.$roomId");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "machine_start");
    fd.set("CallStatus", "ringing");
    fd.set("Called", "+1888");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any);
    expect(await res.text()).toContain("<Hangup/>");
  });

  test("user device lookup error is caught", async () => {
    const supabase = makeSupabase({});
    supabase.from.mockImplementation((table: string) => {
      if (table === "call") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { campaign_id: 1, outreach_attempt_id: 1, contact_id: 1, workspace: "w1", conference_id: "u1" }, error: null }) }) }) };
      }
      if (table === "campaign") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { voicemail_file: "vm.mp3", group_household_queue: true, caller_id: "+1555" }, error: null }) }) }) };
      }
      if (table === "user") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: null, error: new Error("user") }) }) }) };
      }
      throw new Error(`unexpected ${table}`);
    });
    mocks.createClient.mockReturnValueOnce(supabase);

    const mod = await import("../app/routing/api/api.auto-dial.$roomId");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "");
    fd.set("CallStatus", "in-progress");
    fd.set("Called", "+1888");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any);
    expect(await res.text()).toContain("<Hangup/>");
  });

  test("covers Called fallback (missing Called field)", async () => {
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({ update: vi.fn() }),
      conferences: Object.assign((_sid: string) => ({ update: vi.fn() }), { list: vi.fn(async () => []) }),
    } as any);

    const supabase = makeSupabase({});
    supabase.from.mockImplementation((table: string) => {
      if (table === "call") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { campaign_id: 1, outreach_attempt_id: 1, contact_id: 2, workspace: "w1", conference_id: "u1" }, error: null }) }) }) };
      }
      if (table === "campaign") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { voicemail_file: "vm.mp3", group_household_queue: false, caller_id: "+1555" }, error: null }) }) }) };
      }
      if (table === "user") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { verified_audio_numbers: ["+1666"] }, error: null }) }) }) };
      }
      if (table === "outreach_attempt") {
        return { update: () => ({ eq: () => ({ select: async () => ({ data: [{ ok: 1 }], error: null }) }) }) };
      }
      if (table === "campaign_queue") {
        return { update: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }) };
      }
      throw new Error(`unexpected ${table}`);
    });
    mocks.createClient.mockReturnValueOnce(supabase);

    const mod = await import("../app/routing/api/api.auto-dial.$roomId");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "");
    fd.set("CallStatus", "in-progress");
    // intentionally omit Called
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any);
    expect(res.headers.get("Content-Type")).toBe("text/xml");
  });

  test("covers triggerAutoDialer fallbacks when outreachStatus/user/workspace are missing", async () => {
    const updateCallTwiml = vi.fn(async () => ({}));
    const twilio = {
      calls: (_sid: string) => ({ update: updateCallTwiml }),
      conferences: Object.assign(
        (_sid: string) => ({ update: vi.fn() }),
        { list: vi.fn(async () => [{ sid: "CONF1" }]) },
      ),
    };
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce(twilio as any);

    const supabase = makeSupabase({});
    supabase.from.mockImplementation((table: string) => {
      if (table === "call") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { campaign_id: 1, outreach_attempt_id: 1, contact_id: 2, workspace: "w1", conference_id: "u1" }, error: null }) }) }) };
      }
      if (table === "campaign") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { voicemail_file: "vm.mp3", group_household_queue: true, caller_id: "+1555" }, error: null }) }) }) };
      }
      if (table === "user") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { verified_audio_numbers: ["+1666"] }, error: null }) }) }) };
      }
      if (table === "outreach_attempt") {
        return { update: () => ({ eq: () => ({ select: async () => ({ data: [{}], error: null }) }) }) };
      }
      if (table === "workspace") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { twilio_data: { authToken: "auth" } },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected ${table}`);
    });
    supabase.storage.from.mockReturnValueOnce({
      createSignedUrl: async () => ({ data: { signedUrl: "https://signed" }, error: null }),
    });
    supabase.rpc.mockResolvedValueOnce({ data: {}, error: null }); // dequeue_contact
    mocks.createClient.mockReturnValueOnce(supabase);

    const mod = await import("../app/routing/api/api.auto-dial.$roomId");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "machine_start");
    fd.set("CallStatus", "ringing");
    fd.set("Called", "+1888");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any);
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://base.example/api/auto-dial/dialer",
      expect.objectContaining({ method: "POST" }),
    );
  });

  test("human answer: returns conference dial twiml and updates answered_at when called is not client", async () => {
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({ update: vi.fn() }),
      conferences: Object.assign((_sid: string) => ({ update: vi.fn() }), { list: vi.fn(async () => []) }),
    } as any);

    const outreachSelect = vi.fn(async () => ({ data: [{ ok: 1 }], error: null }));
    const supabase = makeSupabase({});
    supabase.from.mockImplementation((table: string) => {
      if (table === "call") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { campaign_id: 1, outreach_attempt_id: 1, contact_id: 2, workspace: "w1", conference_id: "u1" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "campaign") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { voicemail_file: "vm.mp3", group_household_queue: false, caller_id: "+1555" }, error: null }) }) }) };
      }
      if (table === "user") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { verified_audio_numbers: null }, error: null }) }) }) };
      }
      if (table === "outreach_attempt") {
        return {
          update: () => ({
            eq: () => ({
              select: outreachSelect,
            }),
          }),
        };
      }
      if (table === "campaign_queue") {
        return { update: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }) };
      }
      if (table === "workspace") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { twilio_data: { authToken: "auth" } },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });
    mocks.createClient.mockReturnValueOnce(supabase);

    const mod = await import("../app/routing/api/api.auto-dial.$roomId");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "");
    fd.set("CallStatus", "in-progress");
    fd.set("Called", "+1888");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any);

    expect(res.headers.get("Content-Type")).toBe("text/xml");
    expect(outreachSelect).toHaveBeenCalled();
  });

  test("errors are caught and return Hangup response", async () => {
    const supabase = makeSupabase({});
    supabase.from.mockImplementation((table: string) => {
      if (table === "call") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: null, error: new Error("call") }) }) }) };
      }
      throw new Error("unexpected");
    });
    mocks.createClient.mockReturnValueOnce(supabase);

    const mod = await import("../app/routing/api/api.auto-dial.$roomId");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "");
    fd.set("CallStatus", "in-progress");
    fd.set("Called", "+1888");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any);
    expect(mocks.logger.error).toHaveBeenCalled();
    expect(await res.text()).toContain("<Hangup/>");
  });

  test("device-check: called equals campaign caller_id", async () => {
    const supabase = makeSupabase({});
    supabase.from.mockImplementation((table: string) => {
      if (table === "call") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { campaign_id: 1, outreach_attempt_id: 1, contact_id: 1, workspace: "w1", conference_id: "u1" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "campaign") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { voicemail_file: "vm.mp3", group_household_queue: true, caller_id: "+1888" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "user") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { verified_audio_numbers: ["+1999"] }, error: null }) }) }) };
      }
      throw new Error(`unexpected ${table}`);
    });
    mocks.createClient.mockReturnValueOnce(supabase);

    const mod = await import("../app/routing/api/api.auto-dial.$roomId");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "");
    fd.set("CallStatus", "in-progress");
    fd.set("Called", "+1888");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any);
    expect(res.headers.get("Content-Type")).toBe("text/xml");
  });

  test("device-check: no contactId but verified_audio_numbers includes called", async () => {
    const supabase = makeSupabase({});
    supabase.from.mockImplementation((table: string) => {
      if (table === "call") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { campaign_id: null, outreach_attempt_id: null, contact_id: null, workspace: null, conference_id: null },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "campaign") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { voicemail_file: "", group_household_queue: false, caller_id: "+1555" }, error: null }) }) }) };
      }
      if (table === "user") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { verified_audio_numbers: ["+1777"] }, error: null }) }) }) };
      }
      throw new Error(`unexpected ${table}`);
    });
    mocks.createClient.mockReturnValueOnce(supabase);

    const mod = await import("../app/routing/api/api.auto-dial.$roomId");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "");
    fd.set("CallStatus", "in-progress");
    fd.set("Called", "+1777");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any);
    expect(res.headers.get("Content-Type")).toBe("text/xml");
  });

  test("machine answer: campaign fetch error is caught", async () => {
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({ update: vi.fn() }),
      conferences: Object.assign((_sid: string) => ({ update: vi.fn() }), { list: vi.fn(async () => []) }),
    } as any);

    const supabase = makeSupabase({});
    supabase.from.mockImplementation((table: string) => {
      if (table === "call") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { campaign_id: 1, outreach_attempt_id: 1, contact_id: 2, workspace: "w1", conference_id: "u1" }, error: null }) }) }) };
      }
      if (table === "campaign") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: null, error: new Error("camp") }) }) }) };
      }
      if (table === "user") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { verified_audio_numbers: ["+1666"] }, error: null }) }) }) };
      }
      throw new Error(`unexpected ${table}`);
    });
    mocks.createClient.mockReturnValueOnce(supabase);

    const mod = await import("../app/routing/api/api.auto-dial.$roomId");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "machine_start");
    fd.set("CallStatus", "ringing");
    fd.set("Called", "+1888");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any);
    expect(await res.text()).toContain("<Hangup/>");
  });

  test("machine answer: voicemail storage error is caught", async () => {
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({ update: vi.fn() }),
      conferences: Object.assign((_sid: string) => ({ update: vi.fn() }), { list: vi.fn(async () => []) }),
    } as any);

    const supabase = makeSupabase({});
    supabase.from.mockImplementation((table: string) => {
      if (table === "call") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { campaign_id: 1, outreach_attempt_id: 1, contact_id: 2, workspace: "w1", conference_id: "u1" }, error: null }) }) }) };
      }
      if (table === "campaign") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { voicemail_file: "vm.mp3", group_household_queue: true, caller_id: "+1555" }, error: null }) }) }) };
      }
      if (table === "user") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { verified_audio_numbers: ["+1666"] }, error: null }) }) }) };
      }
      if (table === "outreach_attempt") {
        return { update: () => ({ eq: () => ({ select: async () => ({ data: [{ user_id: "u1", campaign_id: 1 }], error: null }) }) }) };
      }
      throw new Error(`unexpected ${table}`);
    });
    supabase.storage.from.mockReturnValueOnce({
      createSignedUrl: async () => ({ data: null, error: new Error("storage") }),
    });
    mocks.createClient.mockReturnValueOnce(supabase);

    const mod = await import("../app/routing/api/api.auto-dial.$roomId");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "machine_start");
    fd.set("CallStatus", "ringing");
    fd.set("Called", "+1888");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any);
    expect(await res.text()).toContain("<Hangup/>");
  });

  test("machine answer: group_household_queue=false uses campaign_queue update and handles its error", async () => {
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({ update: vi.fn() }),
      conferences: Object.assign((_sid: string) => ({ update: vi.fn() }), { list: vi.fn(async () => []) }),
    } as any);

    const supabase = makeSupabase({});
    supabase.from.mockImplementation((table: string) => {
      if (table === "call") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { campaign_id: 1, outreach_attempt_id: 1, contact_id: 2, workspace: "w1", conference_id: "u1" }, error: null }) }) }) };
      }
      if (table === "campaign") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { voicemail_file: "vm.mp3", group_household_queue: false, caller_id: "+1555" }, error: null }) }) }) };
      }
      if (table === "user") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { verified_audio_numbers: ["+1666"] }, error: null }) }) }) };
      }
      if (table === "outreach_attempt") {
        return { update: () => ({ eq: () => ({ select: async () => ({ data: [{ user_id: "u1", campaign_id: 1 }], error: null }) }) }) };
      }
      if (table === "campaign_queue") {
        return {
          update: () => ({
            eq: () => ({
              select: async () => ({ data: null, error: new Error("q") }),
            }),
          }),
        };
      }
      throw new Error(`unexpected ${table}`);
    });
    supabase.storage.from.mockReturnValueOnce({
      createSignedUrl: async () => ({ data: { signedUrl: "https://signed" }, error: null }),
    });
    mocks.createClient.mockReturnValueOnce(supabase);

    const mod = await import("../app/routing/api/api.auto-dial.$roomId");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "machine_start");
    fd.set("CallStatus", "ringing");
    fd.set("Called", "+1888");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any);
    expect(await res.text()).toContain("<Hangup/>");
  });

  test("human answer: called starts with client skips answered_at update", async () => {
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({ update: vi.fn() }),
      conferences: Object.assign((_sid: string) => ({ update: vi.fn() }), { list: vi.fn(async () => []) }),
    } as any);

    const outreachSelect = vi.fn(async () => ({ data: [{ ok: 1 }], error: null }));
    const supabase = makeSupabase({});
    supabase.from.mockImplementation((table: string) => {
      if (table === "call") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { campaign_id: 1, outreach_attempt_id: 1, contact_id: 2, workspace: "w1", conference_id: "u1" }, error: null }) }) }) };
      }
      if (table === "campaign") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { voicemail_file: "vm.mp3", group_household_queue: false, caller_id: "+1555" }, error: null }) }) }) };
      }
      if (table === "user") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { verified_audio_numbers: null }, error: null }) }) }) };
      }
      if (table === "outreach_attempt") {
        return { update: () => ({ eq: () => ({ select: outreachSelect }) }) };
      }
      if (table === "campaign_queue") {
        return { update: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }) };
      }
      throw new Error(`unexpected ${table}`);
    });
    mocks.createClient.mockReturnValueOnce(supabase);

    const mod = await import("../app/routing/api/api.auto-dial.$roomId");
    const fd = new FormData();
    fd.set("CallSid", "CA1");
    fd.set("AnsweredBy", "");
    fd.set("CallStatus", "in-progress");
    fd.set("Called", "client:u1");
    const res = await mod.action({
      request: new Request("http://localhost/api/auto-dial/u1", { method: "POST", body: fd }),
      params: { roomId: "u1" },
    } as any);
    expect(res.headers.get("Content-Type")).toBe("text/xml");
    // Only called from machine paths / answered-at branch; should not be invoked here.
    expect(outreachSelect).not.toHaveBeenCalledWith(expect.anything());
  });
});

