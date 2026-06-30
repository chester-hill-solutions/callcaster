import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
});

import { asRouteResponse, normalizeRouteResult } from "./helpers/route-result";

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
    BETTER_AUTH_URL: () => "http://adminDb.test",
    BETTER_AUTH_ANON_KEY: () => "anon-key",
    BETTER_AUTH_SERVICE_KEY: () => "service-key",
    BETTER_AUTH_PUBLISHABLE_KEY: () => "publishable-key",
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

const adminDbMocks = vi.hoisted(() => ({
  workspaceRow: {
    twilio_data: { sid: "AC", authToken: "t" },
    key: "",
    token: "",
  } as Record<string, unknown> | null,
  workspaceError: null as Error | null,
  callRows: [] as Array<{ sid: string }>,
  callLookupError: null as Error | null,
  messageRows: [] as Array<{ sid: string }>,
  messageQueryError: null as Error | null,
  messageSelectCalls: 0,
  nextQueryKind: "message" as "message" | "call",
}));

vi.mock("@/server/admin-db", () => ({
  adminDb: {
    query: {
      workspace: {
        findFirst: vi.fn(async () => {
          if (adminDbMocks.workspaceError) {
            throw adminDbMocks.workspaceError;
          }
          return adminDbMocks.workspaceRow;
        }),
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          if (adminDbMocks.nextQueryKind === "call") {
            if (adminDbMocks.callLookupError) {
              return Promise.reject(adminDbMocks.callLookupError);
            }
            return Promise.resolve(adminDbMocks.callRows);
          }
          return {
            limit: vi.fn(async () => {
              adminDbMocks.messageSelectCalls += 1;
              if (adminDbMocks.messageQueryError) {
                throw adminDbMocks.messageQueryError;
              }
              if (adminDbMocks.messageSelectCalls === 1) {
                return adminDbMocks.messageRows;
              }
              return [];
            }),
          };
        }),
      })),
    })),
  },
}));

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
    adminDbMocks.workspaceRow = {
      twilio_data: { sid: "AC", authToken: "t" },
      key: "",
      token: "",
    };
    adminDbMocks.workspaceError = null;
    adminDbMocks.callRows = [];
    adminDbMocks.callLookupError = null;
    adminDbMocks.messageRows = [];
    adminDbMocks.messageQueryError = null;
    adminDbMocks.messageSelectCalls = 0;
    adminDbMocks.nextQueryKind = "message";
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
    } catch (e: unknown) {
      const normalized = await normalizeRouteResult(e);
      expect(normalized.status).toBe(400);
      expect(normalized.body).toEqual({ error: "Invalid JSON" });
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
    const res = await asRouteResponse(mod.handleError(new Error("boom"), "nope", 418));
    expect(res.status).toBe(418);
    await expect(res.json()).resolves.toEqual({ error: "nope" });
    expect(loggerMocks.error).toHaveBeenCalled();

    // Covers default status param = 500
    const res2 = await asRouteResponse(mod.handleError(new Error("boom"), "nope"));
    expect(res2.status).toBe(500);
  });

  test("endConferenceByUser throws when workspace lookup fails or user_id missing", async () => {
    const mod = await import("../app/lib/database.server");

    adminDbMocks.workspaceError = new Error("no row");
    await expect(
      mod.endConferenceByUser({
        workspace_id: "w1",
        user_id: "u1",
        null: {} as any,
      }),
    ).rejects.toThrow("no row");

    adminDbMocks.workspaceError = null;
    adminDbMocks.workspaceRow = null;
    await expect(
      mod.endConferenceByUser({
        workspace_id: "w1",
        user_id: "u1",
        null: {} as any,
      }),
    ).rejects.toThrow("No workspace found");

    adminDbMocks.workspaceRow = {
      twilio_data: { sid: "AC", authToken: "t" },
      key: "",
      token: "",
    };

    await expect(
      mod.endConferenceByUser({
        workspace_id: "w1",
        user_id: "",
        null: {} as any,
      }),
    ).rejects.toThrow("User ID is required");
  });

  test("endConferenceByUser completes conferences and attempts to hang up calls, logging per-call/per-conf failures", async () => {
    const mod = await import("../app/lib/database.server");

    adminDbMocks.nextQueryKind = "call";
    adminDbMocks.callRows = [{ sid: "CA1" }, { sid: "CA2" }];

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
        null: {} as any,
      }),
    ).resolves.toBeUndefined();

    expect(loggerMocks.error).toHaveBeenCalled(); // at least one error for conf/call
  });

  test("endConferenceByUser logs when call lookup errors for a conference", async () => {
    const mod = await import("../app/lib/database.server");

    adminDbMocks.nextQueryKind = "call";
    adminDbMocks.callLookupError = new Error("call-select-failed");

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
        null: {} as any,
      }),
    ).resolves.toBeUndefined();
    expect(loggerMocks.error).toHaveBeenCalled();
  });

  test("cancelQueuedCalls returns canceled IDs, aggregates per-call errors, and handles list() failures", async () => {
    const mod = await import("../app/lib/database.server");

    const client = {
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

    const res = await mod.cancelQueuedCalls(twilio, client, 2);
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
    const res2 = await mod.cancelQueuedCalls(twilioFail, client, 100);
    expect(res2.canceledCalls).toEqual([]);
    expect(res2.errors[0]).toMatch(/Error retrieving calls: list failed/);

    const twilioFailUnknown = {
      calls: { list: async () => Promise.reject("nope") },
    } as any;
    const res3 = await mod.cancelQueuedCalls(twilioFailUnknown, client, 100);
    expect(res3.errors[0]).toMatch(/Error retrieving calls: Unknown error/);

    // Covers default batchSize = 100
    const twilioEmpty = { calls: { list: async () => [] } } as any;
    const res4 = await mod.cancelQueuedCalls(twilioEmpty, client);
    expect(res4).toEqual({ canceledCalls: [], errors: [] });
  });

  test("cancelQueuedMessages returns canceled IDs, aggregates per-message errors, and handles list() failures", async () => {
    const mod = await import("../app/lib/database.server");

    const client = {
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

    const res = await mod.cancelQueuedMessages(twilio, client, 2);
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
    const res2 = await mod.cancelQueuedMessages(twilioFail, client, 100);
    expect(res2.canceledMessages).toEqual([]);
    expect(res2.errors[0]).toMatch(/Error retrieving messages: Unknown error/);

    const twilioFailErr = {
      messages: { list: async () => Promise.reject(new Error("list failed")) },
    } as any;
    const res2b = await mod.cancelQueuedMessages(twilioFailErr, client, 100);
    expect(res2b.errors[0]).toMatch(/Error retrieving messages: list failed/);

    // Covers default batchSize = 100
    const twilioEmpty = { messages: { list: async () => [] } } as any;
    const res3 = await mod.cancelQueuedMessages(twilioEmpty, client);
    expect(res3).toEqual({ canceledMessages: [], errors: [] });
  });

  test("cancelQueuedMessagesForCampaign only cancels queued rows for the requested campaign", async () => {
    const mod = await import("../app/lib/database.server");

    const update = vi
      .fn()
      .mockResolvedValueOnce({ sid: "SM1" })
      .mockResolvedValueOnce({ sid: "SM2" });

    adminDbMocks.messageRows = [{ sid: "SM1" }, { sid: "SM2" }];
    adminDbMocks.messageSelectCalls = 0;
    adminDbMocks.nextQueryKind = "message";

    const client = {
      rpc: vi.fn(async () => ({})),
    } as any;

    const twilio = {
      messages: ((sid: string) => ({
        update: async () => update(sid),
      })) as any,
    } as any;

    const res = await mod.cancelQueuedMessagesForCampaign(
      twilio,
      client,
      77,
      10,
    );
    expect(res).toEqual({ canceledMessages: ["SM1", "SM2"], errors: [] });
    expect(update).toHaveBeenCalledTimes(2);
    expect(adminDb.rpc).toHaveBeenCalledTimes(2);

    adminDbMocks.messageRows = [];
    adminDbMocks.messageSelectCalls = 0;
    const resDefault = await mod.cancelQueuedMessagesForCampaign(
      twilio,
      client,
      99,
    );
    expect(resDefault).toEqual({ canceledMessages: [], errors: [] });
  });

  test("cancelQueuedMessagesForCampaign handles query errors and thrown exceptions", async () => {
    const mod = await import("../app/lib/database.server");

    const twilio = {
      messages: ((sid: string) => ({ update: async () => ({ sid }) })) as any,
    } as any;

    adminDbMocks.messageQueryError = new Error("db down");
    adminDbMocks.messageSelectCalls = 0;
    const queryErrorRes = await mod.cancelQueuedMessagesForCampaign(
      twilio,
      {} as any,
      1,
      5,
    );
    expect(queryErrorRes).toEqual({
      canceledMessages: [],
      errors: ["Error retrieving messages: db down"],
    });

    adminDbMocks.messageQueryError = new Error("");
    adminDbMocks.messageSelectCalls = 0;
    const unknownMessageRes = await mod.cancelQueuedMessagesForCampaign(
      twilio,
      {} as any,
      1,
      5,
    );
    expect(unknownMessageRes).toEqual({
      canceledMessages: [],
      errors: ["Error retrieving messages: Unknown error"],
    });

    adminDbMocks.messageQueryError = new Error("explode");
    adminDbMocks.messageSelectCalls = 0;
    const thrownRes = await mod.cancelQueuedMessagesForCampaign(
      twilio,
      {} as any,
      1,
      5,
    );
    expect(thrownRes).toEqual({
      canceledMessages: [],
      errors: ["Error retrieving messages: explode"],
    });

    adminDbMocks.messageQueryError = "nope" as unknown as Error;
    adminDbMocks.messageSelectCalls = 0;
    const unknownThrownRes = await mod.cancelQueuedMessagesForCampaign(
      twilio,
      {} as any,
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
    adminDbMocks.messageRows = [{ sid: "SM1" }, { sid: "SM2" }];
    adminDbMocks.messageSelectCalls = 0;
    adminDbMocks.nextQueryKind = "message";
    const client = {
      rpc: vi.fn(async () => ({})),
    } as any;

    const twilio = {
      messages: ((sid: string) => ({ update: async () => update(sid) })) as any,
    } as any;

    const res = await mod.cancelQueuedMessagesForCampaign(
      twilio,
      client,
      55,
      2,
    );
    expect(res).toEqual({ canceledMessages: ["SM1", "SM2"], errors: [] });
    expect(adminDbMocks.messageSelectCalls).toBe(2);
  });

  test("cancelQueuedMessagesForCampaign handles null queuedMessages payload", async () => {
    const mod = await import("../app/lib/database.server");

    adminDbMocks.messageRows = [];
    adminDbMocks.messageSelectCalls = 0;

    const twilio = {
      messages: ((sid: string) => ({ update: async () => ({ sid }) })) as any,
    } as any;

    const res = await mod.cancelQueuedMessagesForCampaign(
      twilio,
      {} as any,
      12,
      3,
    );
    expect(res).toEqual({ canceledMessages: [], errors: [] });
  });
});
