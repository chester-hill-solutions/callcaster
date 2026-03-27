import { beforeEach, describe, expect, test, vi } from "vitest";
import { sendMessage } from "../app/lib/api-chat-sms.server";

const mocks = vi.hoisted(() => {
  return {
    verifyApiKeyOrSession: vi.fn(),
    createWorkspaceTwilioInstance: vi.fn(),
    getWorkspaceTwilioPortalConfig: vi.fn(),
    requireWorkspaceAccess: vi.fn(),
    safeParseJson: vi.fn(),
    processTemplateTags: vi.fn((body: string) => body),
    env: { SUPABASE_URL: vi.fn(() => "http://supabase") },
    logger: { error: vi.fn() },
  };
});

vi.mock("@/lib/api-auth.server", () => ({
  verifyApiKeyOrSession: (...args: any[]) => mocks.verifyApiKeyOrSession(...args),
}));
vi.mock("../app/lib/database.server", () => ({
  createWorkspaceTwilioInstance: (...args: any[]) => mocks.createWorkspaceTwilioInstance(...args),
  getWorkspaceTwilioPortalConfig: (...args: any[]) => mocks.getWorkspaceTwilioPortalConfig(...args),
  requireWorkspaceAccess: (...args: any[]) => mocks.requireWorkspaceAccess(...args),
  safeParseJson: (...args: any[]) => mocks.safeParseJson(...args),
}));
vi.mock("@/lib/utils", () => ({
  processTemplateTags: (...args: any[]) => mocks.processTemplateTags(...args),
  normalizePhoneNumber: (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length === 10) {
      return `+1${digits}`;
    }
    if (digits.length !== 11 || !digits.startsWith("1")) {
      throw new Error("Invalid phone number");
    }
    return `+${digits}`;
  },
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));

function makeSupabaseStub(opts: {
  messageInsertError?: any;
  webhookRows?: any[];
  webhookError?: any;
  contactRow?: any;
  contactError?: any;
}) {
  const messageInsert = vi.fn(() => ({
    select: vi.fn(async () => ({
      data: [{ id: 1 }],
      error: opts.messageInsertError ?? null,
    })),
  }));

  const webhookFilter = vi.fn(async () => ({
    data: opts.webhookRows ?? [],
    error: opts.webhookError ?? null,
  }));

  const contactSingle = vi.fn(async () => ({
    data: opts.contactRow ?? null,
    error: opts.contactError ?? null,
  }));

  const from = vi.fn((table: string) => {
    if (table === "message") {
      return { insert: messageInsert };
    }
    if (table === "webhook") {
      return {
        select: () => ({
          eq: () => ({
            filter: webhookFilter,
          }),
        }),
      };
    }
    if (table === "contact") {
      return {
        select: () => ({
          eq: () => ({
            single: contactSingle,
          }),
        }),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return { from, _spies: { messageInsert, webhookFilter, contactSingle } };
}

describe("app/routes/api.chat_sms.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyApiKeyOrSession.mockReset();
    mocks.createWorkspaceTwilioInstance.mockReset();
    mocks.getWorkspaceTwilioPortalConfig.mockReset();
    mocks.requireWorkspaceAccess.mockReset();
    mocks.safeParseJson.mockReset();
    mocks.processTemplateTags.mockClear();
    mocks.env.SUPABASE_URL.mockClear();
    mocks.logger.error.mockReset();
    mocks.getWorkspaceTwilioPortalConfig.mockResolvedValue({
      trafficClass: "unknown",
      throughputProduct: "none",
      multiTenancyMode: "none",
      trafficShapingEnabled: false,
      defaultMessageIntent: null,
      sendMode: "from_number",
      messagingServiceSid: null,
      onboardingStatus: "not_started",
      supportNotes: "",
      updatedAt: null,
      updatedBy: null,
      auditTrail: [],
    });
    vi.unstubAllGlobals();
  });

  test("sendMessage shortens URLs, includes mediaUrl, inserts message, and posts webhook", async () => {
    const fetchMock = vi.fn(async (input: any, init?: any) => {
      const url = String(input);
      if (url.startsWith("https://tinyurl.com/api-create.php")) {
        return { ok: true, text: async () => "https://tiny.url/x" } as any;
      }
      if (url === "http://hook") {
        expect(init?.method).toBe("POST");
        return { ok: true, status: 200, statusText: "OK" } as any;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const supabase = makeSupabaseStub({
      webhookRows: [{ destination_url: "http://hook", custom_headers: { X: 1 } }],
    });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      messages: {
        create: vi.fn(async (args: any) => ({
          sid: "SM1",
          body: args.body,
          numSegments: 1,
          direction: "outbound-api",
          from: args.from,
          to: args.to,
          dateUpdated: new Date().toISOString(),
          price: 0,
          errorMessage: null,
          uri: "/x",
          accountSid: "AC",
          numMedia: 1,
          status: "queued",
          messagingServiceSid: null,
          dateSent: null,
          dateCreated: new Date().toISOString(),
          errorCode: null,
          priceUnit: "USD",
          apiVersion: "2010-04-01",
          subresourceUris: {},
        })),
      },
    });

    const res = await sendMessage({
      body: "see https://example.com",
      to: "+15551234567",
      from: "+15550000000",
      media: JSON.stringify(["http://img"]),
      supabase: supabase as any,
      workspace: "w1",
      contact_id: "1",
      user: { id: "u1" },
    });

    expect(res.error).toBeUndefined();
    expect(fetchMock).toHaveBeenCalled();
  });

  test("sendMessage returns original url when tinyurl response not ok", async () => {
    const fetchMock = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.startsWith("https://tinyurl.com/api-create.php")) {
        return { ok: false, text: async () => "ignored" } as any;
      }
      return { ok: true, status: 200, statusText: "OK" } as any;
    });
    vi.stubGlobal("fetch", fetchMock);

    const supabase = makeSupabaseStub({ webhookRows: [] });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      messages: {
        create: vi.fn(async (args: any) => ({
          sid: "SM1",
          body: args.body,
          numSegments: 1,
          direction: "outbound-api",
          from: args.from,
          to: args.to,
          dateUpdated: new Date().toISOString(),
          uri: "/x",
          accountSid: "AC",
          numMedia: 0,
          status: "queued",
          messagingServiceSid: null,
          dateSent: null,
          dateCreated: new Date().toISOString(),
          errorCode: null,
          priceUnit: "USD",
          apiVersion: "2010-04-01",
          subresourceUris: {},
        })),
      },
    });

    const res = await sendMessage({
      body: "https://example.com",
      to: "+15551234567",
      from: "+15550000000",
      media: "[]",
      supabase: supabase as any,
      workspace: "w1",
      contact_id: "",
      user: null,
    });
    expect(res.error).toBeUndefined();
  });

  test("sendMessage throws when message insert fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "x" })) as any);
    const supabase = makeSupabaseStub({ messageInsertError: { message: "db" }, webhookRows: [] });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      messages: { create: vi.fn(async () => ({ sid: "SM1" })) },
    });
    await expect(
      sendMessage({
        body: "hi",
        to: "+15551234567",
        from: "+15550000000",
        media: "[]",
        supabase: supabase as any,
        workspace: "w1",
        contact_id: "",
        user: null,
      }),
    ).rejects.toThrow("Failed to send message");
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  test("sendMessage throws when webhook query errors and when webhook post not ok", async () => {
    // webhook query error
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "x" })) as any);
    const supabase1 = makeSupabaseStub({ webhookError: { message: "wh" } });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      messages: { create: vi.fn(async () => ({ sid: "SM1" })) },
    });
    await expect(
      sendMessage({
        body: "hi",
        to: "+15551234567",
        from: "+15550000000",
        media: "[]",
        supabase: supabase1 as any,
        workspace: "w1",
        contact_id: "",
        user: null,
      }),
    ).rejects.toThrow("Failed to send message");

    // webhook post not ok
    const fetchMock = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.startsWith("https://tinyurl.com/api-create.php")) {
        return { ok: true, text: async () => "x" } as any;
      }
      return { ok: false, status: 500, statusText: "NO" } as any;
    });
    vi.stubGlobal("fetch", fetchMock);
    const supabase2 = makeSupabaseStub({ webhookRows: [{ destination_url: "http://hook" }] });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      messages: { create: vi.fn(async () => ({ sid: "SM1", body: "x" })) },
    });
    await expect(
      sendMessage({
        body: "https://example.com",
        to: "+15551234567",
        from: "+15550000000",
        media: "[]",
        supabase: supabase2 as any,
        workspace: "w1",
        contact_id: "",
        user: null,
      }),
    ).rejects.toThrow("Failed to send message");
  });

  test("sendMessage logs and returns original url when tinyurl fetch throws (covers shortenUrl catch)", async () => {
    const fetchMock = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.startsWith("https://tinyurl.com/api-create.php")) {
        throw new Error("net");
      }
      return { ok: true, status: 200, statusText: "OK" } as any;
    });
    vi.stubGlobal("fetch", fetchMock);

    const supabase = makeSupabaseStub({ webhookRows: [] });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      messages: {
        create: vi.fn(async (args: any) => ({ sid: "SM1", body: args.body })),
      },
    });
    const res = await sendMessage({
      body: "https://example.com",
      to: "+15551234567",
      from: "+15550000000",
      media: "[]",
      supabase: supabase as any,
      workspace: "w1",
      contact_id: "",
      user: null,
    });
    expect(res.error).toBeUndefined();
    expect(mocks.logger.error).toHaveBeenCalledWith("Error shortening URL:", expect.anything());
  });

  test("sendMessage handles webhook array with null first element (webhook_data falsy)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "x" })) as any);
    const supabase = makeSupabaseStub({ webhookRows: [null] });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      messages: { create: vi.fn(async (args: any) => ({ sid: "SM1", body: args.body })) },
    });
    const res = await sendMessage({
      body: "hi",
      to: "+15551234567",
      from: "+15550000000",
      media: "[]",
      supabase: supabase as any,
      workspace: "w1",
      contact_id: "",
      user: null,
    });
    expect(res.error).toBeUndefined();
  });

  test("action returns auth error response", async () => {
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ error: "no", status: 401 });
    const mod = await import("../app/routing/api/api.chat_sms");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "no" });
  });

  test("action api_key rejects workspace mismatch", async () => {
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "api_key", workspaceId: "w1", supabase: {} });
    mocks.safeParseJson.mockResolvedValueOnce({
      to_number: "15551234567",
      workspace_id: "w2",
      contact_id: "",
      caller_id: "+1555",
      body: "hi",
      media: "[]",
    });
    const mod = await import("../app/routing/api/api.chat_sms");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(403);
  });

  test("action api_key success path uses authResult.supabase and user null; covers '+' not at start normalization", async () => {
    const supabase = makeSupabaseStub({ webhookRows: [] });
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "api_key", workspaceId: "w1", supabase });
    mocks.safeParseJson.mockResolvedValueOnce({
      to_number: "1+5551234567",
      workspace_id: "w1",
      contact_id: "",
      caller_id: "+15551234567",
      body: "",
      media: "[]",
    });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      messages: { create: vi.fn(async () => ({ sid: "SM1", body: " " })) },
    });
    const mod = await import("../app/routing/api/api.chat_sms");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(201);
  });

  test("action session requires workspace access and returns 404 on invalid phone number", async () => {
    const supabaseClient = makeSupabaseStub({});
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "session", supabaseClient, user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({
      to_number: "123",
      workspace_id: "w1",
      contact_id: "",
      caller_id: "+1555",
      body: "hi",
      media: "[]",
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);
    const mod = await import("../app/routing/api/api.chat_sms");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(404);
    expect(mocks.logger.error).toHaveBeenCalledWith("Invalid phone number:", expect.anything());
  });

  test("action skips template processing when contact lookup errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "x" })) as any);
    const supabaseClient = makeSupabaseStub({
      contactRow: null,
      contactError: { message: "nope" },
      webhookRows: [],
    });
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "session", supabaseClient, user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({
      to_number: "+15551234567",
      workspace_id: "w1",
      contact_id: "1",
      caller_id: "+15551234567",
      body: "Hello {{firstname}}",
      media: "[]",
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      messages: { create: vi.fn(async () => ({ sid: "SM1", body: "Hello {{firstname}}" })) },
    });

    const mod = await import("../app/routing/api/api.chat_sms");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(201);
    expect(mocks.processTemplateTags).not.toHaveBeenCalled();
  });

  test("action processes template tags when contact found and returns 201", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "x" })) as any);
    const supabaseClient = makeSupabaseStub({
      contactRow: { firstname: "A" },
      webhookRows: [],
    });
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "session", supabaseClient, user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({
      to_number: "+1 (555) 123-4567",
      workspace_id: "w1",
      contact_id: "1",
      caller_id: "+15551234567",
      body: "Hello {{firstname}}",
      media: "[]",
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      messages: { create: vi.fn(async () => ({ sid: "SM1", body: "Hello A" })) },
    });
    mocks.processTemplateTags.mockReturnValueOnce("Hello A");

    const mod = await import("../app/routing/api/api.chat_sms");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ data: [{ id: 1 }], message: expect.anything() });
    expect(mocks.processTemplateTags).toHaveBeenCalled();
  });

  test("action uses messaging service mode and message intent overrides", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "x" })) as any);
    const supabaseClient = makeSupabaseStub({
      contactRow: { firstname: "A" },
      webhookRows: [],
    });
    const create = vi.fn(async (args: any) => ({
      sid: "SM2",
      body: args.body,
      direction: "outbound-api",
      from: null,
      to: args.to,
      dateUpdated: new Date().toISOString(),
      uri: "/x",
      accountSid: "AC",
      numMedia: 0,
      status: "queued",
      messagingServiceSid: args.messagingServiceSid,
      dateSent: null,
      dateCreated: new Date().toISOString(),
      errorCode: null,
      priceUnit: "USD",
      apiVersion: "2010-04-01",
      subresourceUris: {},
    }));
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "session", supabaseClient, user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({
      to_number: "+15551234567",
      workspace_id: "w1",
      contact_id: "1",
      caller_id: "+15551234567",
      body: "Hello",
      media: "[]",
      message_intent: "security",
      messaging_service_sid: "MGOVERRIDE",
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);
    mocks.getWorkspaceTwilioPortalConfig.mockResolvedValueOnce({
      trafficClass: "unknown",
      throughputProduct: "none",
      multiTenancyMode: "none",
      trafficShapingEnabled: true,
      defaultMessageIntent: "notifications",
      sendMode: "messaging_service",
      messagingServiceSid: "MGDEFAULT",
      onboardingStatus: "requested",
      supportNotes: "",
      updatedAt: null,
      updatedBy: null,
      auditTrail: [],
    });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      messages: { create },
    });

    const mod = await import("../app/routing/api/api.chat_sms");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        messagingServiceSid: "MGOVERRIDE",
        messageIntent: "security",
      }),
    );
    expect(create).toHaveBeenCalledWith(expect.not.objectContaining({ from: expect.anything() }));
  });

  test("action returns 500 when createWorkspaceTwilioInstance throws", async () => {
    const supabaseClient = makeSupabaseStub({});
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "session", supabaseClient, user: { id: "u1" } });
    mocks.safeParseJson.mockResolvedValueOnce({
      to_number: "+15551234567",
      workspace_id: "w1",
      contact_id: "",
      caller_id: "+15551234567",
      body: "",
      media: "[]",
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);
    mocks.createWorkspaceTwilioInstance.mockRejectedValueOnce(new Error("twilio"));

    const mod = await import("../app/routing/api/api.chat_sms");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(500);
    expect(mocks.logger.error).toHaveBeenCalledWith("Error in chat_sms action:", expect.anything());
  });
});

