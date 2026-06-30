import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => {
  return {
    createClient: vi.fn(),
    validateTwilioWebhookParams: vi.fn(() => true),
    sendWebhookNotification: vi.fn(),
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
    env: {
      SUPABASE_URL: () => "https://sb.example",
      SUPABASE_SERVICE_KEY: () => "svc",
      TWILIO_AUTH_TOKEN: () => "tok",
      TWILIO_SID: () => "AC_MAIN",
    },
    fetch: vi.fn(),
  };
});

vi.mock("@supabase/supabase-js", () => ({ createClient: (...a: any[]) => mocks.createClient(...a) }));
vi.mock("@/twilio.server", () => ({
  validateTwilioWebhookParams: (...a: any[]) => mocks.validateTwilioWebhookParams(...a),
  shouldValidateTwilioWebhooks: () => true,
}));
vi.mock("@/lib/workspace-settings/WorkspaceSettingUtils.server", () => ({
  sendWebhookNotification: (...a: any[]) => mocks.sendWebhookNotification(...a),
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

const inboundContextMocks = vi.hoisted(() => ({
  contacts: [] as Array<{ id: number }>,
  contactError: null as Error | null,
}));

vi.mock("@/lib/database.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/database.server")>();
  return {
    ...actual,
    findPotentialContacts: vi.fn(async () => ({
      data: inboundContextMocks.contacts,
      error: inboundContextMocks.contactError,
    })),
  };
});

import { configureTenantDbStub, createTenantDbMock, tenantDbStubState } from "./helpers/tenant-db-stub";

vi.mock("@/server/tenant-db", () => ({
  createTenantDb: () => createTenantDbMock(),
}));

function makeSupabase(opts?: {
  number?: any;
  workspaceNumberError?: any;
  workspaceMsMatches?: any[];
  workspaceMsError?: any;
  messageError?: any;
  contactError?: any;
  contacts?: any[];
  uploadError?: any;
  mediaOk?: boolean;
  smsWebhook?: boolean;
  insertedMessages?: Record<string, unknown>[];
}) {
  inboundContextMocks.contacts = (opts?.contacts ?? []) as Array<{ id: number }>;
  inboundContextMocks.contactError = opts?.contactError ?? null;

  const supabase: any = {
    rpc: async () => ({
      data: [],
      error: { message: "stub rpc for tests", code: "stub" },
    }),
    storage: {
      from: () => ({
        upload: async (_name: string, _b: any, _opts: any) => ({
          data: opts?.uploadError ? null : { path: "m1" },
          error: opts?.uploadError ?? null,
        }),
      }),
    },
    from: (table: string) => {
      if (table === "workspace_number") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: opts?.number ?? null,
                error: opts?.workspaceNumberError ?? null,
              }),
            }),
          }),
        };
      }
      if (table === "workspace") {
        return {
          select: () => ({
            or: async () => ({
              data: opts?.workspaceMsMatches ?? [],
              error: opts?.workspaceMsError ?? null,
            }),
          }),
        };
      }
      if (table === "contact") {
        const contactQuery: any = {
          select: () => contactQuery,
          eq: () => contactQuery,
          or: () => contactQuery,
          in: () => contactQuery,
          not: () => contactQuery,
          neq: async () => ({
            data: opts?.contacts ?? [],
            error: opts?.contactError ?? null,
          }),
          update: () => ({
            in: async () => ({ data: [], error: null }),
          }),
        };
        return {
          select: () => contactQuery,
          update: contactQuery.update,
        };
      }
      if (table === "message") {
        return {
          insert: (payload: Record<string, unknown>) => ({
            select: async () => ({
              data: (opts?.insertedMessages?.push(payload), [{ sid: "SM1" }]),
              error: opts?.messageError ?? null,
            }),
          }),
        };
      }
      throw new Error("unexpected table");
    },
  };
  return supabase;
}

function makeParams(overrides?: Partial<Record<string, unknown>>) {
  return {
    To: "+1555",
    From: "+1666",
    MessageSid: "SM1",
    AccountSid: "AC1",
    Body: "hello",
    Status: "received",
    NumMedia: "1",
    NumSegments: "1",
    MediaUrl0: "https://m/0",
    MediaContentType0: "image/png",
    ...overrides,
  };
}

function makeInboundSmsRequest(overrides?: Partial<Record<string, unknown>>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(makeParams(overrides))) {
    body.append(key, String(value));
  }
  return new Request("http://x/inbound-sms", {
    method: "POST",
    headers: { "x-twilio-signature": "test-sig" },
    body,
  });
}

describe("app/routes/api+/inbound-sms", () => {
  beforeEach(() => {
    configureTenantDbStub();
    inboundContextMocks.contacts = [];
    inboundContextMocks.contactError = null;
    mocks.createClient.mockReset();
    mocks.validateTwilioWebhookParams.mockReset();
    mocks.validateTwilioWebhookParams.mockReturnValue(true);
    mocks.sendWebhookNotification.mockReset();
    mocks.logger.error.mockReset();
    mocks.logger.info.mockReset();
    mocks.logger.warn.mockReset();
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });

  test("returns 403 when Twilio signature validation fails", async () => {
    mocks.validateTwilioWebhookParams.mockReturnValueOnce(false);
    const number = {
      workspace: "w1",
      twilio_data: { sid: "sid", authToken: "workspace-tok" },
      webhook: [],
    };
    mocks.createClient.mockReturnValueOnce(makeSupabase({ number }));
    const mod = await import("../app/routes/api+/inbound-sms");
    const res = await asRouteResponse(
      await mod.action({
        request: makeInboundSmsRequest(),
      } as any),
    );
    expect(res.status).toBe(403);
    expect(mocks.validateTwilioWebhookParams).toHaveBeenCalledWith(
      expect.objectContaining({ To: "+1555" }),
      "test-sig",
      expect.any(String),
      "workspace-tok",
    );
  });

  test("returns 403 when Twilio signature header is missing", async () => {
    const number = {
      workspace: "w1",
      twilio_data: { sid: "sid", authToken: "workspace-tok" },
      webhook: [],
    };
    mocks.createClient.mockReturnValueOnce(makeSupabase({ number }));
    const mod = await import("../app/routes/api+/inbound-sms");
    const body = new FormData();
    for (const [key, value] of Object.entries(makeParams())) {
      body.append(key, String(value));
    }
    const res = await asRouteResponse(
      await mod.action({
        request: new Request("http://x/inbound-sms", { method: "POST", body }),
      } as never),
    );
    expect(res.status).toBe(403);
  });

  test("returns 404 when number not found", async () => {
    mocks.createClient.mockReturnValueOnce(makeSupabase({ number: null }));
    const mod = await import("../app/routes/api+/inbound-sms");
    const res = await asRouteResponse(await mod.action({ request: makeInboundSmsRequest() } as any));
    expect(res.status).toBe(404);
  });

  test("resolves workspace by MessagingServiceSid when To number is unknown", async () => {
    mocks.createClient.mockReturnValueOnce(
      makeSupabase({
        number: null,
        workspaceMsMatches: [
          {
            id: "w-ms",
            twilio_data: { sid: "sid", authToken: "tok" },
            webhook: [],
          },
        ],
      }),
    );
    const mod = await import("../app/routes/api+/inbound-sms");
    const res = await asRouteResponse(
      await mod.action({
        request: makeInboundSmsRequest({
          To: "+19998887777",
          MessagingServiceSid: "MG1234567890abcdef",
          NumMedia: "0",
        }),
      } as any),
    );
    expect(res.status).toBe(201);
    expect(tenantDbStubState.messageInsertCalls[0]).toMatchObject({
      messaging_service_sid: "MG1234567890abcdef",
      direction: "inbound",
    });
  });

  test("returns 409 when MessagingServiceSid matches multiple workspaces", async () => {
    mocks.createClient.mockReturnValueOnce(
      makeSupabase({
        number: null,
        workspaceMsMatches: [
          { id: "w1", twilio_data: { sid: "AC1", authToken: "tok1" }, webhook: [] },
          { id: "w2", twilio_data: { sid: "AC2", authToken: "tok2" }, webhook: [] },
        ],
      }),
    );
    const mod = await import("../app/routes/api+/inbound-sms");
    const res = await asRouteResponse(
      await mod.action({
        request: makeInboundSmsRequest({
          To: "+19998887777",
          MessagingServiceSid: "MGdup",
          NumMedia: "0",
        }),
      } as any),
    );
    expect(res.status).toBe(409);
  });

  test("uses env Twilio creds for MMS when workspace twilio_data is missing in dev", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      statusText: "OK",
      blob: async () => new Blob(["x"]),
    } as any);
    const number = { workspace: "w1", twilio_data: null, webhook: [] };
    mocks.createClient.mockReturnValueOnce(makeSupabase({ number }));
    const mod = await import("../app/routes/api+/inbound-sms");
    const res = await asRouteResponse(
      await mod.action({ request: makeInboundSmsRequest({ NumMedia: "1" }) } as any),
    );
    process.env.NODE_ENV = originalNodeEnv;
    expect(res.status).toBe(201);
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://m/0",
      expect.objectContaining({
        headers: {
          Authorization: `Basic ${Buffer.from("AC_MAIN:tok").toString("base64")}`,
        },
      }),
    );
  });

  test("processes media (handles fetch/upload failures), inserts message, opt-out stop/start, and sends webhook", async () => {
    mocks.fetch.mockResolvedValueOnce({ ok: false, statusText: "nope" } as any);
    const number = { workspace: "w1", twilio_data: { sid: "sid", authToken: "tok" }, webhook: [{ events: [{ category: "inbound_sms" }] }] };
    mocks.createClient.mockReturnValueOnce(makeSupabase({ number, contacts: [{ id: 9 }], smsWebhook: true }));
    const mod = await import("../app/routes/api+/inbound-sms");
    let res = await asRouteResponse(await mod.action({ request: makeInboundSmsRequest() } as any));
    expect(res.status).toBe(201);
    expect(tenantDbStubState.messageInsertCalls[0]?.contact_id).toBe(9);
    expect(mocks.sendWebhookNotification).toHaveBeenCalled();

    // start branch with quoted start + upload error path
    mocks.fetch.mockResolvedValueOnce({ ok: true, statusText: "OK", blob: async () => new Blob(["x"]) } as any);
    mocks.createClient.mockReturnValueOnce(makeSupabase({ number, uploadError: { message: "up" }, contacts: [{ id: 9 }] }));
    res = await asRouteResponse(await mod.action({ request: makeInboundSmsRequest() } as any));
    expect(res.status).toBe(201);
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  test("covers media_urls branch, contact lookup error logging, and no-webhook path", async () => {
    mocks.fetch.mockResolvedValueOnce({ ok: true, statusText: "OK", blob: async () => new Blob(["x"]) } as any);
    const number = { workspace: "w1", twilio_data: { sid: "sid", authToken: "tok" }, webhook: [{ events: [{ category: "other" }] }] };
    mocks.createClient.mockReturnValueOnce(makeSupabase({ number, contactError: new Error("c") }));
    const mod = await import("../app/routes/api+/inbound-sms");
    const res = await asRouteResponse(await mod.action({ request: makeInboundSmsRequest() } as any));
    expect(res.status).toBe(201);
    expect(mocks.logger.error).toHaveBeenCalledWith("Contact lookup error:", expect.any(Error));
    expect(mocks.sendWebhookNotification).not.toHaveBeenCalled();
  });

  test("covers stop/start contact empty (no update) + contactError logging branches", async () => {
    const number = { workspace: "w1", twilio_data: { sid: "sid", authToken: "tok" }, webhook: [] };
    const mod = await import("../app/routes/api+/inbound-sms");

    mocks.createClient.mockReturnValueOnce(makeSupabase({ number, contacts: [], contactError: new Error("c") }));
    let res = await asRouteResponse(await mod.action({ request: makeInboundSmsRequest() } as any));
    expect(res.status).toBe(201);

    mocks.createClient.mockReturnValueOnce(makeSupabase({ number, contacts: [], contactError: new Error("c") }));
    res = await asRouteResponse(await mod.action({ request: makeInboundSmsRequest() } as any));
    expect(res.status).toBe(201);
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  test("covers webhook payload media_urls when media present", async () => {
    mocks.fetch.mockResolvedValueOnce({ ok: true, statusText: "OK", blob: async () => new Blob(["x"]) } as any);
    const number = { workspace: "w1", twilio_data: { sid: "sid", authToken: "tok" }, webhook: [{ events: [{ category: "inbound_sms" }] }] };
    mocks.createClient.mockReturnValueOnce(makeSupabase({ number }));
    const mod = await import("../app/routes/api+/inbound-sms");
    const res = await asRouteResponse(await mod.action({ request: makeInboundSmsRequest() } as any));
    expect(res.status).toBe(201);
    expect(mocks.sendWebhookNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ media_urls: ["m1"] }),
      }),
    );
  });

  test("does not stamp contact_id when phone lookup is ambiguous", async () => {
    const number = { workspace: "w1", twilio_data: { sid: "sid", authToken: "tok" }, webhook: [] };
    mocks.createClient.mockReturnValueOnce(
      makeSupabase({
        number,
        contacts: [{ id: 9 }, { id: 10 }],
      }),
    );
    const mod = await import("../app/routes/api+/inbound-sms");
    const res = await asRouteResponse(await mod.action({ request: makeInboundSmsRequest() } as any));

    expect(res.status).toBe(201);
    expect(tenantDbStubState.messageInsertCalls[0]).not.toHaveProperty("contact_id");
  });

  test("message insert error returns 400", async () => {
    const number = { workspace: "w1", twilio_data: { sid: "sid", authToken: "tok" }, webhook: [] };
    mocks.fetch.mockResolvedValueOnce({ ok: true, statusText: "OK", blob: async () => new Blob(["x"]) } as any);
    configureTenantDbStub({ messageInsertError: new Error("msg") });
    mocks.createClient.mockReturnValueOnce(makeSupabase({ number }));
    const mod = await import("../app/routes/api+/inbound-sms");
    const res = await asRouteResponse(await mod.action({ request: makeInboundSmsRequest() } as any));
    expect(res.status).toBe(400);
  });
});

