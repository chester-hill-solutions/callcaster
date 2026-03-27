import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    createClient: vi.fn(),
    validateTwilioWebhook: vi.fn(),
    sendWebhookNotification: vi.fn(),
    findPotentialContacts: vi.fn(),
    logger: { error: vi.fn() },
    env: {
      SUPABASE_URL: () => "https://sb.example",
      SUPABASE_SERVICE_KEY: () => "svc",
      TWILIO_AUTH_TOKEN: () => "tok",
    },
    fetch: vi.fn(),
  };
});

vi.mock("@supabase/supabase-js", () => ({ createClient: (...a: any[]) => mocks.createClient(...a) }));
vi.mock("@/twilio.server", () => ({ validateTwilioWebhook: (...a: any[]) => mocks.validateTwilioWebhook(...a) }));
vi.mock("@/lib/workspace-settings/WorkspaceSettingUtils", () => ({
  sendWebhookNotification: (...a: any[]) => mocks.sendWebhookNotification(...a),
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/database.server", () => ({
  findPotentialContacts: (...args: unknown[]) => mocks.findPotentialContacts(...args),
}));

function makeSupabase(opts?: {
  number?: any;
  messageError?: any;
  contactError?: any;
  contacts?: any[];
  uploadError?: any;
  mediaOk?: boolean;
  smsWebhook?: boolean;
  insertedMessages?: Record<string, unknown>[];
}) {
  const supabase: any = {
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
              single: async () => ({
                data: opts?.number ?? null,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "contact") {
        const contactQuery: any = {
          select: () => contactQuery,
          eq: () => contactQuery,
          or: () => contactQuery,
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

describe("app/routes/api.inbound-sms.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.validateTwilioWebhook.mockReset();
    mocks.sendWebhookNotification.mockReset();
    mocks.logger.error.mockReset();
    mocks.findPotentialContacts.mockReset();
    mocks.findPotentialContacts.mockResolvedValue({ data: [], error: null });
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });

  test("returns validation Response directly", async () => {
    mocks.validateTwilioWebhook.mockResolvedValueOnce(new Response("no", { status: 403 }));
    mocks.createClient.mockReturnValueOnce(makeSupabase());
    const mod = await import("../app/routing/api/api.inbound-sms");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(403);
  });

  test("returns 404 when number not found", async () => {
    mocks.validateTwilioWebhook.mockResolvedValueOnce({ params: makeParams() });
    mocks.createClient.mockReturnValueOnce(makeSupabase({ number: null }));
    const mod = await import("../app/routing/api/api.inbound-sms");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(404);
  });

  test("processes media (handles fetch/upload failures), inserts message, opt-out stop/start, and sends webhook", async () => {
    mocks.findPotentialContacts.mockResolvedValue({ data: [{ id: 9 }], error: null });
    mocks.validateTwilioWebhook.mockResolvedValueOnce({ params: makeParams({ Body: "stop" }) });
    mocks.fetch.mockResolvedValueOnce({ ok: false, statusText: "nope" } as any);
    const number = { workspace: "w1", twilio_data: { sid: "sid", authToken: "tok" }, webhook: [{ events: [{ category: "inbound_sms" }] }] };
    const insertedMessages: Record<string, unknown>[] = [];
    mocks.createClient.mockReturnValueOnce(makeSupabase({ number, contacts: [{ id: 9 }], insertedMessages, smsWebhook: true }));
    const mod = await import("../app/routing/api/api.inbound-sms");
    let res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(201);
    expect(insertedMessages[0]?.contact_id).toBe(9);
    expect(mocks.sendWebhookNotification).toHaveBeenCalled();

    // start branch with quoted start + upload error path
    mocks.validateTwilioWebhook.mockResolvedValueOnce({ params: makeParams({ Body: '"start"' }) });
    mocks.fetch.mockResolvedValueOnce({ ok: true, statusText: "OK", blob: async () => new Blob(["x"]) } as any);
    mocks.createClient.mockReturnValueOnce(makeSupabase({ number, uploadError: { message: "up" }, contacts: [{ id: 9 }] }));
    res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(201);
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  test("covers media_urls branch, contact lookup error logging, and no-webhook path", async () => {
    mocks.findPotentialContacts.mockResolvedValueOnce({ data: [], error: new Error("c") });
    mocks.validateTwilioWebhook.mockResolvedValueOnce({ params: makeParams({ Body: "hello", NumMedia: "1" }) });
    mocks.fetch.mockResolvedValueOnce({ ok: true, statusText: "OK", blob: async () => new Blob(["x"]) } as any);
    const number = { workspace: "w1", twilio_data: { sid: "sid", authToken: "tok" }, webhook: [{ events: [{ category: "other" }] }] };
    mocks.createClient.mockReturnValueOnce(makeSupabase({ number, contactError: new Error("c") }));
    const mod = await import("../app/routing/api/api.inbound-sms");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(201);
    expect(mocks.logger.error).toHaveBeenCalledWith("Contact lookup error:", expect.any(Error));
    expect(mocks.sendWebhookNotification).not.toHaveBeenCalled();
  });

  test("covers stop/start contact empty (no update) + contactError logging branches", async () => {
    const number = { workspace: "w1", twilio_data: { sid: "sid", authToken: "tok" }, webhook: [] };
    const mod = await import("../app/routing/api/api.inbound-sms");

    mocks.findPotentialContacts.mockResolvedValueOnce({ data: [], error: new Error("c") });
    mocks.validateTwilioWebhook.mockResolvedValueOnce({ params: makeParams({ Body: "stop", NumMedia: "0" }) });
    mocks.createClient.mockReturnValueOnce(makeSupabase({ number, contacts: [], contactError: new Error("c") }));
    let res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(201);

    mocks.findPotentialContacts.mockResolvedValueOnce({ data: [], error: new Error("c") });
    mocks.validateTwilioWebhook.mockResolvedValueOnce({ params: makeParams({ Body: "start", NumMedia: "0" }) });
    mocks.createClient.mockReturnValueOnce(makeSupabase({ number, contacts: [], contactError: new Error("c") }));
    res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(201);
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  test("covers webhook payload media_urls when media present", async () => {
    mocks.findPotentialContacts.mockResolvedValueOnce({ data: [], error: null });
    mocks.validateTwilioWebhook.mockResolvedValueOnce({ params: makeParams({ Body: "hello", NumMedia: "1" }) });
    mocks.fetch.mockResolvedValueOnce({ ok: true, statusText: "OK", blob: async () => new Blob(["x"]) } as any);
    const number = { workspace: "w1", twilio_data: { sid: "sid", authToken: "tok" }, webhook: [{ events: [{ category: "inbound_sms" }] }] };
    mocks.createClient.mockReturnValueOnce(makeSupabase({ number }));
    const mod = await import("../app/routing/api/api.inbound-sms");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(201);
    expect(mocks.sendWebhookNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ media_urls: ["m1"] }),
      }),
    );
  });

  test("does not stamp contact_id when phone lookup is ambiguous", async () => {
    mocks.findPotentialContacts.mockResolvedValueOnce({
      data: [{ id: 9 }, { id: 10 }],
      error: null,
    });
    mocks.validateTwilioWebhook.mockResolvedValueOnce({ params: makeParams({ NumMedia: "0" }) });
    const number = { workspace: "w1", twilio_data: { sid: "sid", authToken: "tok" }, webhook: [] };
    const insertedMessages: Record<string, unknown>[] = [];
    mocks.createClient.mockReturnValueOnce(
      makeSupabase({
        number,
        contacts: [{ id: 9 }, { id: 10 }],
        insertedMessages,
      }),
    );
    const mod = await import("../app/routing/api/api.inbound-sms");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);

    expect(res.status).toBe(201);
    expect(insertedMessages[0]).not.toHaveProperty("contact_id");
  });

  test("message insert error returns 400", async () => {
    mocks.findPotentialContacts.mockResolvedValueOnce({ data: [{ id: 9 }], error: null });
    mocks.validateTwilioWebhook.mockResolvedValueOnce({ params: makeParams() });
    const number = { workspace: "w1", twilio_data: { sid: "sid", authToken: "tok" }, webhook: [] };
    mocks.fetch.mockResolvedValueOnce({ ok: true, statusText: "OK", blob: async () => new Blob(["x"]) } as any);
    mocks.createClient.mockReturnValueOnce(makeSupabase({ number, messageError: new Error("msg") }));
    const mod = await import("../app/routing/api/api.inbound-sms");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(400);
  });
});

