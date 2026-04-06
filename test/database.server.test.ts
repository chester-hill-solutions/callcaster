import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

const loggerMocks = vi.hoisted(() => {
  return { error: vi.fn() };
});

vi.mock("../app/lib/logger.server", () => {
  return {
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: loggerMocks.error,
    },
  };
});

vi.mock("../app/lib/env.server", () => ({
  env: {
    SUPABASE_URL: () => "http://supabase.test",
    SUPABASE_ANON_KEY: () => "anon-key",
    SUPABASE_SERVICE_KEY: () => "service-key",
    SUPABASE_PUBLISHABLE_KEY: () => "publishable-key",
    TWILIO_SID: () => "AC123",
    TWILIO_AUTH_TOKEN: () => "auth-token",
    TWILIO_APP_SID: () => "AP123",
    TWILIO_PHONE_NUMBER: () => "+15550000000",
    STRIPE_SECRET_KEY: () => "stripe-key",
    RESEND_API_KEY: () => "resend-key",
  },
}));

const twilioMocks = vi.hoisted(() => {
  return {
    instance: null as any,
  };
});

vi.mock("twilio", () => {
  class TwilioClientMock {
    constructor() {
      // Allow tests to inject the instance behavior.
      return twilioMocks.instance;
    }
  }
  return {
    default: {
      Twilio: TwilioClientMock,
    },
  };
});

describe("database.server helpers", () => {
  beforeEach(() => {
    twilioMocks.instance = null;
    loggerMocks.error.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("parseRequestData handles json, urlencoded, missing, and unsupported content-types", async () => {
    const mod = await import("../app/lib/database.server");

    const missing = new Request("http://localhost/x", { method: "POST" });
    await expect(mod.parseRequestData(missing)).resolves.toBeUndefined();

    const jsonReq = new Request("http://localhost/x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ a: 1 }),
    });
    await expect(mod.parseRequestData(jsonReq)).resolves.toEqual({ a: 1 });

    const jsonCharsetReq = new Request("http://localhost/x", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ a: 2 }),
    });
    await expect(mod.parseRequestData(jsonCharsetReq)).resolves.toEqual({
      a: 2,
    });

    const urlReq = new Request("http://localhost/x", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: new URLSearchParams({ a: "1", b: "2" }),
    });
    await expect(mod.parseRequestData(urlReq)).resolves.toEqual({
      a: "1",
      b: "2",
    });

    const bad = new Request("http://localhost/x", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "x",
    });
    await expect(mod.parseRequestData(bad)).rejects.toThrow(
      "Unsupported content type",
    );
  }, 30000);

  test("safeParseJson returns data, throws 400 Response on SyntaxError, and rethrows non-SyntaxError", async () => {
    const mod = await import("../app/lib/database.server");

    const ok = new Request("http://localhost/x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true }),
    });
    await expect(mod.safeParseJson(ok)).resolves.toEqual({ ok: true });

    const bad = new Request("http://localhost/x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    try {
      await mod.safeParseJson(bad);
      throw new Error("expected throw");
    } catch (e: any) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBe(400);
      await expect((e as Response).json()).resolves.toEqual({
        error: "Invalid JSON",
      });
    }

    const nonSyntaxReq = {
      json: async () => {
        throw new TypeError("boom");
      },
    } as any;
    await expect(mod.safeParseJson(nonSyntaxReq)).rejects.toThrow("boom");
  });

  test("parseActionRequest parses json and form bodies (including duplicate keys)", async () => {
    const mod = await import("../app/lib/database.server");

    const jsonReq = new Request("http://localhost/x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ a: 1 }),
    });
    await expect(mod.parseActionRequest(jsonReq)).resolves.toEqual({ a: 1 });

    const urlReq = new Request("http://localhost/x", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams([
        ["k", "1"],
        ["k", "2"],
        ["k", "3"],
        ["x", "y"],
      ]),
    });
    await expect(mod.parseActionRequest(urlReq)).resolves.toEqual({
      k: ["1", "2", "3"],
      x: "y",
    });

    const fd = new FormData();
    fd.append("file", new File(["x"], "x.txt", { type: "text/plain" }));
    const fdReq = new Request("http://localhost/x", {
      method: "POST",
      body: fd,
    });
    const parsed = await mod.parseActionRequest(fdReq);
    expect(parsed.file).toBeInstanceOf(File);

    // Covers default Content-Type fallback (null => "")
    const fd2 = new FormData();
    fd2.append("k", "1");
    await expect(
      mod.parseActionRequest({
        headers: { get: () => null },
        formData: async () => fd2,
      } as any),
    ).resolves.toEqual({ k: "1" });
  });

  test("handleError logs and returns json response", async () => {
    const mod = await import("../app/lib/database.server");
    const res = mod.handleError(new Error("boom"), "nope", 418);
    expect(res.status).toBe(418);
    await expect(res.json()).resolves.toEqual({ error: "nope" });
    expect(loggerMocks.error).toHaveBeenCalled();

    // Covers default status param = 500
    const res2 = mod.handleError(new Error("boom"), "nope");
    expect(res2.status).toBe(500);
  });

  test("endConferenceByUser throws when workspace lookup fails or user_id missing", async () => {
    const mod = await import("../app/lib/database.server");
    const supabaseClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: new Error("no row") }),
          }),
        }),
      }),
    } as any;

    await expect(
      mod.endConferenceByUser({
        workspace_id: "w1",
        user_id: "u1",
        supabaseClient,
      }),
    ).rejects.toThrow("no row");

    const supabaseNoDataNoError = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    } as any;
    await expect(
      mod.endConferenceByUser({
        workspace_id: "w1",
        user_id: "u1",
        supabaseClient: supabaseNoDataNoError,
      }),
    ).rejects.toThrow("No workspace found");

    const supabaseOk = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                twilio_data: { sid: "AC", authToken: "t" },
                key: "",
                token: "",
              },
              error: null,
            }),
          }),
        }),
      }),
    } as any;

    await expect(
      mod.endConferenceByUser({
        workspace_id: "w1",
        user_id: "",
        supabaseClient: supabaseOk,
      }),
    ).rejects.toThrow("User ID is required");
  });

  test("endConferenceByUser completes conferences and attempts to hang up calls, logging per-call/per-conf failures", async () => {
    const mod = await import("../app/lib/database.server");

    const supabaseClient = {
      from: (table: string) => {
        if (table === "workspace") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    twilio_data: { sid: "AC", authToken: "t" },
                    key: "",
                    token: "",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "call") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ sid: "CA1" }, { sid: "CA2" }],
                error: null,
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as any;

    const callsUpdate = vi
      .fn()
      .mockResolvedValueOnce({}) // CA1 ok
      .mockRejectedValueOnce(new Error("call-update-failed")); // CA2 fails -> logged

    const conferencesUpdate = vi
      .fn()
      .mockRejectedValueOnce(new Error("conf-update-failed")); // first conf fails -> logged

    twilioMocks.instance = {
      conferences: Object.assign(
        (sid: string) => ({
          update:
            sid === "CONF_BAD" ? conferencesUpdate : vi.fn(async () => ({})),
        }),
        {
          list: vi.fn(async () => [{ sid: "CONF_BAD" }, { sid: "CONF_OK" }]),
        },
      ),
      calls: (sid: string) => ({
        update: () =>
          callsUpdate(sid, { twiml: "<Response><Hangup/></Response>" }),
      }),
    };

    await expect(
      mod.endConferenceByUser({
        workspace_id: "w1",
        user_id: "u1",
        supabaseClient,
      }),
    ).resolves.toBeUndefined();

    expect(loggerMocks.error).toHaveBeenCalled(); // at least one error for conf/call
  });

  test("endConferenceByUser logs when call lookup errors for a conference", async () => {
    const mod = await import("../app/lib/database.server");

    const supabaseClient = {
      from: (table: string) => {
        if (table === "workspace") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    twilio_data: { sid: "AC", authToken: "t" },
                    key: "",
                    token: "",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "call") {
          return {
            select: () => ({
              eq: async () => ({
                data: [],
                error: new Error("call-select-failed"),
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as any;

    twilioMocks.instance = {
      conferences: Object.assign(
        (sid: string) => ({
          update: async () => ({}),
        }),
        { list: async () => [{ sid: "CONF_X" }] },
      ),
      calls: (_sid: string) => ({ update: async () => ({}) }),
    };

    await expect(
      mod.endConferenceByUser({
        workspace_id: "w1",
        user_id: "u1",
        supabaseClient,
      }),
    ).resolves.toBeUndefined();
    expect(loggerMocks.error).toHaveBeenCalled();
  });

  test("cancelQueuedCalls returns canceled IDs, aggregates per-call errors, and handles list() failures", async () => {
    const mod = await import("../app/lib/database.server");

    const supabase = {
      rpc: vi.fn(async () => ({})),
    } as any;

    const update = vi
      .fn()
      .mockResolvedValueOnce({ sid: "CA1" })
      .mockRejectedValueOnce("nope") // non-Error -> Unknown error
      .mockRejectedValueOnce(new Error("call update failed")); // Error -> message

    let listCalls = 0;
    const twilio = {
      calls: Object.assign(
        (sid: string) => ({ update: async () => update(sid) }),
        {
          list: async () => {
            listCalls++;
            if (listCalls === 1)
              return [{ sid: "CA1" }, { sid: "CA2" }, { sid: "CA3" }];
            return [];
          },
        },
      ),
    } as any;

    const res = await mod.cancelQueuedCalls(twilio, supabase, 2);
    expect(res.canceledCalls).toEqual(["CA1"]);
    expect(res.errors.join("\n")).toMatch(
      /Error canceling call CA2: Unknown error/,
    );
    expect(res.errors.join("\n")).toMatch(
      /Error canceling call CA3: call update failed/,
    );

    const twilioFail = {
      calls: { list: async () => Promise.reject(new Error("list failed")) },
    } as any;
    const res2 = await mod.cancelQueuedCalls(twilioFail, supabase, 100);
    expect(res2.canceledCalls).toEqual([]);
    expect(res2.errors[0]).toMatch(/Error retrieving calls: list failed/);

    const twilioFailUnknown = {
      calls: { list: async () => Promise.reject("nope") },
    } as any;
    const res3 = await mod.cancelQueuedCalls(twilioFailUnknown, supabase, 100);
    expect(res3.errors[0]).toMatch(/Error retrieving calls: Unknown error/);

    // Covers default batchSize = 100
    const twilioEmpty = { calls: { list: async () => [] } } as any;
    const res4 = await mod.cancelQueuedCalls(twilioEmpty, supabase);
    expect(res4).toEqual({ canceledCalls: [], errors: [] });
  });

  test("cancelQueuedMessages returns canceled IDs, aggregates per-message errors, and handles list() failures", async () => {
    const mod = await import("../app/lib/database.server");

    const supabase = {
      rpc: vi.fn(async () => ({})),
    } as any;

    const update = vi
      .fn()
      .mockResolvedValueOnce({ sid: "SM1" })
      .mockRejectedValueOnce(new Error("msg update failed"))
      .mockRejectedValueOnce("nope");

    let listMessages = 0;
    const twilio = {
      messages: Object.assign(
        (sid: string) => ({ update: async () => update(sid) }),
        {
          list: async () => {
            listMessages++;
            if (listMessages === 1)
              return [{ sid: "SM1" }, { sid: "SM2" }, { sid: "SM3" }];
            return [];
          },
        },
      ),
    } as any;

    const res = await mod.cancelQueuedMessages(twilio, supabase, 2);
    expect(res.canceledMessages).toEqual(["SM1"]);
    expect(res.errors.join("\n")).toMatch(
      /Error canceling call SM2: msg update failed/,
    );
    expect(res.errors.join("\n")).toMatch(
      /Error canceling call SM3: Unknown error/,
    );

    const twilioFail = {
      messages: { list: async () => Promise.reject("nope") },
    } as any;
    const res2 = await mod.cancelQueuedMessages(twilioFail, supabase, 100);
    expect(res2.canceledMessages).toEqual([]);
    expect(res2.errors[0]).toMatch(/Error retrieving messages: Unknown error/);

    const twilioFailErr = {
      messages: { list: async () => Promise.reject(new Error("list failed")) },
    } as any;
    const res2b = await mod.cancelQueuedMessages(twilioFailErr, supabase, 100);
    expect(res2b.errors[0]).toMatch(/Error retrieving messages: list failed/);

    // Covers default batchSize = 100
    const twilioEmpty = { messages: { list: async () => [] } } as any;
    const res3 = await mod.cancelQueuedMessages(twilioEmpty, supabase);
    expect(res3).toEqual({ canceledMessages: [], errors: [] });
  });

  test("cancelQueuedMessagesForCampaign only cancels queued rows for the requested campaign", async () => {
    const mod = await import("../app/lib/database.server");

    const update = vi
      .fn()
      .mockResolvedValueOnce({ sid: "SM1" })
      .mockResolvedValueOnce({ sid: "SM2" });

    let selectCalls = 0;
    const supabase = {
      rpc: vi.fn(async () => ({})),
      from: vi.fn((table: string) => {
        expect(table).toBe("message");
        const builder: any = {};
        builder.select = () => builder;
        builder.eq = (field: string, value: unknown) => {
          expect(field).toBe("campaign_id");
          expect(value).toBe(77);
          return builder;
        };
        builder.in = (field: string, statuses: string[]) => {
          expect(field).toBe("status");
          expect(statuses).toEqual(["accepted", "scheduled", "queued"]);
          return builder;
        };
        builder.limit = async () => {
          selectCalls += 1;
          if (selectCalls === 1) {
            return {
              data: [{ sid: "SM1" }, { sid: "SM2" }],
              error: null,
            };
          }
          return { data: [], error: null };
        };
        return builder;
      }),
    } as any;

    const twilio = {
      messages: ((sid: string) => ({
        update: async () => update(sid),
      })) as any,
    } as any;

    const res = await mod.cancelQueuedMessagesForCampaign(
      twilio,
      supabase,
      77,
      10,
    );
    expect(res).toEqual({ canceledMessages: ["SM1", "SM2"], errors: [] });
    expect(update).toHaveBeenCalledTimes(2);
    expect(supabase.rpc).toHaveBeenCalledTimes(2);

    // Covers default batchSize = 100 path.
    const supabaseEmpty = {
      from: vi.fn(() => {
        const builder: any = {};
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.in = () => builder;
        builder.limit = async () => ({ data: [], error: null });
        return builder;
      }),
    } as any;
    const resDefault = await mod.cancelQueuedMessagesForCampaign(
      twilio,
      supabaseEmpty,
      99,
    );
    expect(resDefault).toEqual({ canceledMessages: [], errors: [] });
  });

  test("cancelQueuedMessagesForCampaign handles query errors and thrown exceptions", async () => {
    const mod = await import("../app/lib/database.server");

    const twilio = {
      messages: ((sid: string) => ({ update: async () => ({ sid }) })) as any,
    } as any;

    const supabaseQueryError = {
      from: vi.fn(() => {
        const builder: any = {};
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.in = () => builder;
        builder.limit = async () => ({
          data: null,
          error: { message: "db down" },
        });
        return builder;
      }),
    } as any;

    const queryErrorRes = await mod.cancelQueuedMessagesForCampaign(
      twilio,
      supabaseQueryError,
      1,
      5,
    );
    expect(queryErrorRes).toEqual({
      canceledMessages: [],
      errors: ["Error retrieving messages: db down"],
    });

    const supabaseQueryUnknown = {
      from: vi.fn(() => {
        const builder: any = {};
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.in = () => builder;
        builder.limit = async () => ({
          data: null,
          error: { message: "" },
        });
        return builder;
      }),
    } as any;

    const unknownMessageRes = await mod.cancelQueuedMessagesForCampaign(
      twilio,
      supabaseQueryUnknown,
      1,
      5,
    );
    expect(unknownMessageRes).toEqual({
      canceledMessages: [],
      errors: ["Error retrieving messages: Unknown error"],
    });

    const supabaseThrown = {
      from: vi.fn(() => {
        throw new Error("explode");
      }),
    } as any;

    const thrownRes = await mod.cancelQueuedMessagesForCampaign(
      twilio,
      supabaseThrown,
      1,
      5,
    );
    expect(thrownRes).toEqual({
      canceledMessages: [],
      errors: ["Error retrieving messages: explode"],
    });

    const supabaseThrownUnknown = {
      from: vi.fn(() => {
        throw "nope";
      }),
    } as any;

    const unknownThrownRes = await mod.cancelQueuedMessagesForCampaign(
      twilio,
      supabaseThrownUnknown,
      1,
      5,
    );
    expect(unknownThrownRes).toEqual({
      canceledMessages: [],
      errors: ["Error retrieving messages: Unknown error"],
    });
  });

  test("cancelQueuedMessagesForCampaign continues when page size equals batch size", async () => {
    const mod = await import("../app/lib/database.server");

    const update = vi.fn(async (sid: string) => ({ sid }));
    let page = 0;
    const supabase = {
      rpc: vi.fn(async () => ({})),
      from: vi.fn(() => {
        const builder: any = {};
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.in = () => builder;
        builder.limit = async () => {
          page += 1;
          if (page === 1) {
            return { data: [{ sid: "SM1" }, { sid: "SM2" }], error: null };
          }
          return { data: [], error: null };
        };
        return builder;
      }),
    } as any;

    const twilio = {
      messages: ((sid: string) => ({ update: async () => update(sid) })) as any,
    } as any;

    const res = await mod.cancelQueuedMessagesForCampaign(
      twilio,
      supabase,
      55,
      2,
    );
    expect(res).toEqual({ canceledMessages: ["SM1", "SM2"], errors: [] });
    expect(page).toBe(2);
  });

  test("cancelQueuedMessagesForCampaign handles null queuedMessages payload", async () => {
    const mod = await import("../app/lib/database.server");

    const supabaseNullData = {
      from: vi.fn(() => {
        const builder: any = {};
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.in = () => builder;
        builder.limit = async () => ({ data: null, error: null });
        return builder;
      }),
    } as any;

    const twilio = {
      messages: ((sid: string) => ({ update: async () => ({ sid }) })) as any,
    } as any;

    const res = await mod.cancelQueuedMessagesForCampaign(
      twilio,
      supabaseNullData,
      12,
      3,
    );
    expect(res).toEqual({ canceledMessages: [], errors: [] });
  });
});
