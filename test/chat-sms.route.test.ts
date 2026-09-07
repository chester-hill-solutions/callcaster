import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import {
  TEST_WORKSPACE_ID,
  TEST_WORKSPACE_ID_ALT,
} from "./helpers/public-api-fixtures";

const mocks = vi.hoisted(() => {
  return {
    verifyApiKeyOrSession: vi.fn(),
    createWorkspaceTwilioInstance: vi.fn(),
    getWorkspaceTwilioPortalConfig: vi.fn(),
    requireWorkspaceAccess: vi.fn(),
    parseJsonBodyOrResponse: vi.fn(),
    processTemplateTags: vi.fn((body: string) => body),
    getWorkspaceCreditsBalance: vi.fn(async () => 100),
    env: { BETTER_AUTH_URL: vi.fn(() => "http://client"), BASE_URL: vi.fn(() => "https://app.example") },
    logger: { error: vi.fn() , info: vi.fn(), debug: vi.fn()},
  };
});

const webhookMocks = vi.hoisted(() => ({
  sendWorkspaceWebhookNotification: vi.fn(async () => ({ success: true })),
}));

const tenantDbMocks = vi.hoisted(() => ({
  message: {
    insert: vi.fn(async () => [{ id: 1 }]),
    // Intent-row resolve/cleanup (#1586).
    update: vi.fn(async () => [{ id: 1 }]),
    delete: vi.fn(async () => undefined),
  },
  contact: {
    findFirst: vi.fn(async () => null),
  },
}));


vi.mock("@/lib/capability-guard.server", () => ({
  requireDualAuthCapability: async () => ({ type: "ok" }),
  requireDataPlaneCapability: async () => ({ type: "ok" }),
}));

vi.mock("@/lib/api-auth.server", () => ({
  verifyApiKeyOrSession: (...args: any[]) => mocks.verifyApiKeyOrSession(...args),
}));
vi.mock("@/lib/api-parse.server", () => ({
  parseJsonBodyOrResponse: (...args: any[]) => mocks.parseJsonBodyOrResponse(...args),
}));
vi.mock("../app/lib/database/workspace.server", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../app/lib/database/workspace.server")
    >();
  return {
    ...actual,
    createWorkspaceTwilioInstance: (...args: any[]) =>
      mocks.createWorkspaceTwilioInstance(...args),
    getWorkspaceTwilioPortalConfig: (...args: any[]) =>
      mocks.getWorkspaceTwilioPortalConfig(...args),
    requireWorkspaceAccess: (...args: any[]) =>
      mocks.requireWorkspaceAccess(...args),
  };
});
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
vi.mock("@/lib/twilio-readiness.server", () => ({
  assertWorkspaceCanSendSms: vi.fn(async () => undefined),
}));
vi.mock("@/lib/twilio-client.server", () => ({
  withTwilioRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));
vi.mock("@/lib/workspace-credits.server", () => ({
  getWorkspaceCreditsBalance: (...args: any[]) => mocks.getWorkspaceCreditsBalance(...args),
}));
vi.mock("@/lib/workspace-events.server", () => ({
  emitChatMessageEvent: vi.fn(async () => undefined),
}));
vi.mock("@/lib/workspace-webhooks.server", () => ({
  sendWorkspaceWebhookNotification: (...args: unknown[]) =>
    webhookMocks.sendWorkspaceWebhookNotification(...args),
}));

vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => tenantDbMocks),
}));

function makeDbClientStub(opts: {
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
      const webhookRow = opts.webhookRows?.[0] ?? null;
      return {
        select: () => ({
          eq: () => ({
            single: vi.fn(async () => ({
              data: webhookRow,
              error: opts.webhookError ?? null,
            })),
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

describe("app/routes/api+/chat_sms/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyApiKeyOrSession.mockReset();
    mocks.createWorkspaceTwilioInstance.mockReset();
    mocks.getWorkspaceTwilioPortalConfig.mockReset();
    mocks.requireWorkspaceAccess.mockReset();
    mocks.parseJsonBodyOrResponse.mockReset();
    mocks.processTemplateTags.mockClear();
    mocks.getWorkspaceCreditsBalance.mockReset();
    mocks.getWorkspaceCreditsBalance.mockResolvedValue(100);
    mocks.env.BETTER_AUTH_URL.mockClear();
    mocks.logger.error.mockReset();
    webhookMocks.sendWorkspaceWebhookNotification.mockReset();
    webhookMocks.sendWorkspaceWebhookNotification.mockResolvedValue({ success: true });
    tenantDbMocks.message.insert.mockReset();
    tenantDbMocks.message.insert.mockResolvedValue([{ id: 1 }]);
    tenantDbMocks.message.update.mockReset();
    tenantDbMocks.message.update.mockResolvedValue([{ id: 1 }]);
    tenantDbMocks.contact.findFirst.mockReset();
    tenantDbMocks.contact.findFirst.mockResolvedValue(null);
    mocks.getWorkspaceTwilioPortalConfig.mockResolvedValue({
      trafficClass: "unknown",
      throughputProduct: "none",
      multiTenancyMode: "none",
      trafficShapingEnabled: false,
      defaultMessageIntent: null,
      sendMode: "from_number",
      messagingServiceSid: null,
      onboardingStatus: "not_started",
      smsSenderClass: "unknown",
      smsTargetMps: 1,
      voiceTargetCps: 1,
      voiceConcurrentCallLimit: 100,
      parallelDispatchEnabled: false,
      supportNotes: "",
      updatedAt: null,
      updatedBy: null,
      auditTrail: [],
    });
    vi.unstubAllGlobals();
  });

  test("sendMessage preserves URLs for from-number sends and posts webhook", async () => {
    const fetchMock = vi.fn(async (input: any, init?: any) => {
      const url = String(input);
      if (url === "http://hook") {
        expect(init?.method).toBe("POST");
        return { ok: true, status: 200, statusText: "OK" } as any;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = makeDbClientStub({
      webhookRows: [
        {
          destination_url: "http://hook",
          custom_headers: { X: 1 },
          events: [{ category: "outbound_sms", type: "INSERT" }],
        },
      ],
    });
    const create = vi.fn(async (args: any) => ({
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
    }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      messages: { create },
    });

    const mod = await import("../app/routes/api+/chat_sms.send.server");
    const res = await mod.sendMessage({
      body: "see https://example.com",
      to: "+15551234567",
      from: "+15550000000",
      media: JSON.stringify(["http://img"]),
      client: client as any,
      workspace: "w1",
      contact_id: "1",
      user: { id: "u1" },
    });

    expect(res.error).toBeUndefined();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ body: "see https://example.com" }),
    );
  });

  test("sendMessage uses Twilio shortenUrls for messaging service sends with URLs", async () => {
    mocks.getWorkspaceTwilioPortalConfig.mockResolvedValueOnce({
      trafficClass: "unknown",
      throughputProduct: "none",
      multiTenancyMode: "none",
      trafficShapingEnabled: false,
      defaultMessageIntent: null,
      sendMode: "messaging_service",
      messagingServiceSid: "MG123",
      onboardingStatus: "enabled",
      smsSenderClass: "verified_toll_free",
      smsTargetMps: 3,
      voiceTargetCps: 1,
      voiceConcurrentCallLimit: 100,
      parallelDispatchEnabled: false,
      supportNotes: "",
      updatedAt: null,
      updatedBy: null,
      auditTrail: [],
    });

    const client = makeDbClientStub({ webhookRows: [] });
    const create = vi.fn(async (args: any) => ({
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
      numMedia: 0,
      status: "queued",
      messagingServiceSid: "MG123",
      dateSent: null,
      dateCreated: new Date().toISOString(),
      errorCode: null,
      priceUnit: "USD",
      apiVersion: "2010-04-01",
      subresourceUris: {},
    }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      messages: { create },
    });

    const mod = await import("../app/routes/api+/chat_sms.send.server");
    const res = await mod.sendMessage({
      body: "see https://example.com",
      to: "+15551234567",
      from: "+15550000000",
      media: "[]",
      client: client as any,
      workspace: "w1",
      contact_id: "1",
      user: { id: "u1" },
    });

    expect(res.error).toBeUndefined();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        messagingServiceSid: "MG123",
        shortenUrls: true,
        body: "see https://example.com",
      }),
    );
  });

  test("sendMessage skips shortenUrls when body has no URLs", async () => {
    mocks.getWorkspaceTwilioPortalConfig.mockResolvedValueOnce({
      trafficClass: "unknown",
      throughputProduct: "none",
      multiTenancyMode: "none",
      trafficShapingEnabled: false,
      defaultMessageIntent: null,
      sendMode: "messaging_service",
      messagingServiceSid: "MG123",
      onboardingStatus: "enabled",
      smsSenderClass: "verified_toll_free",
      smsTargetMps: 3,
      voiceTargetCps: 1,
      voiceConcurrentCallLimit: 100,
      parallelDispatchEnabled: false,
      supportNotes: "",
      updatedAt: null,
      updatedBy: null,
      auditTrail: [],
    });

    const client = makeDbClientStub({ webhookRows: [] });
    const create = vi.fn(async (args: any) => ({
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
      numMedia: 0,
      status: "queued",
      messagingServiceSid: "MG123",
      dateSent: null,
      dateCreated: new Date().toISOString(),
      errorCode: null,
      priceUnit: "USD",
      apiVersion: "2010-04-01",
      subresourceUris: {},
    }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      messages: { create },
    });

    const mod = await import("../app/routes/api+/chat_sms.send.server");
    const res = await mod.sendMessage({
      body: "plain text only",
      to: "+15551234567",
      from: "+15550000000",
      media: "[]",
      client: client as any,
      workspace: "w1",
      contact_id: "",
      user: null,
    });
    expect(res.error).toBeUndefined();
    expect(create).toHaveBeenCalledWith(
      expect.not.objectContaining({ shortenUrls: true }),
    );
  });

  test("sendMessage does not call Twilio when the intent row cannot be written (#1586)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "x" })) as any);
    const client = makeDbClientStub({ messageInsertError: { message: "db" }, webhookRows: [] });
    tenantDbMocks.message.insert.mockRejectedValueOnce(new Error("db"));
    const create = vi.fn(async () => ({ sid: "SM1" }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ messages: { create } });
    const mod = await import("../app/routes/api+/chat_sms.send.server");
    await expect(
      mod.sendMessage({
        body: "hi",
        to: "+15551234567",
        from: "+15550000000",
        media: "[]",
        client: client as any,
        workspace: "w1",
        contact_id: "",
        user: null,
      }),
    ).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });

  test("sendMessage still returns the accepted message when the post-send resolve fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "x" })) as any);
    const client = makeDbClientStub({ webhookRows: [] });
    tenantDbMocks.message.update.mockRejectedValueOnce(new Error("db"));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      messages: { create: vi.fn(async () => ({ sid: "SM1" })) },
    });
    const mod = await import("../app/routes/api+/chat_sms.send.server");
    const res = await mod.sendMessage({
      body: "hi",
      to: "+15551234567",
      from: "+15550000000",
      media: "[]",
      client: client as any,
      workspace: "w1",
      contact_id: "",
      user: null,
    });
    expect(res.message).toMatchObject({ sid: "SM1" });
    expect(res.data).toBeNull();
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "chat_sms.persist_failed",
      expect.objectContaining({ workspace: "w1", sid: "SM1" }),
    );
  });

  test("sendMessage logs webhook failures but still returns when webhook delivery fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "x" })) as any);
    webhookMocks.sendWorkspaceWebhookNotification.mockResolvedValueOnce({
      success: false,
      error: "wh",
    });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      messages: { create: vi.fn(async () => ({ sid: "SM1" })) },
    });
    const mod = await import("../app/routes/api+/chat_sms.send.server");
    await expect(
      mod.sendMessage({
        body: "hi",
        to: "+15551234567",
        from: "+15550000000",
        media: "[]",
        workspace: "w1",
        contact_id: "",
        user: null,
      }),
    ).resolves.toMatchObject({ message: { sid: "SM1" } });
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Outbound SMS webhook delivery failed",
      "wh",
    );

    mocks.logger.error.mockClear();

    webhookMocks.sendWorkspaceWebhookNotification.mockResolvedValueOnce({
      success: false,
      error: "delivery failed",
    });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      messages: { create: vi.fn(async () => ({ sid: "SM1", body: "x" })) },
    });
    await expect(
      mod.sendMessage({
        body: "https://example.com",
        to: "+15551234567",
        from: "+15550000000",
        media: "[]",
        workspace: "w1",
        contact_id: "",
        user: null,
      }),
    ).resolves.toMatchObject({ message: { sid: "SM1" } });
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Outbound SMS webhook delivery failed",
      "delivery failed",
    );
  });

  test("sendMessage preserves URLs when webhook delivery succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, statusText: "OK" } as any)),
    );

    const client = makeDbClientStub({ webhookRows: [] });
    const create = vi.fn(async (args: any) => ({ sid: "SM1", body: args.body }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      messages: { create },
    });
    const mod = await import("../app/routes/api+/chat_sms.send.server");
    const res = await mod.sendMessage({
      body: "https://example.com",
      to: "+15551234567",
      from: "+15550000000",
      media: "[]",
      client: client as any,
      workspace: "w1",
      contact_id: "",
      user: null,
    });
    expect(res.error).toBeUndefined();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ body: "https://example.com" }),
    );
  });

  test("sendMessage handles webhook array with null first element (webhook_data falsy)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "x" })) as any);
    const client = makeDbClientStub({ webhookRows: [null] });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      messages: { create: vi.fn(async (args: any) => ({ sid: "SM1", body: args.body })) },
    });
    const mod = await import("../app/routes/api+/chat_sms.send.server");
    const res = await mod.sendMessage({
      body: "hi",
      to: "+15551234567",
      from: "+15550000000",
      media: "[]",
      client: client as any,
      workspace: "w1",
      contact_id: "",
      user: null,
    });
    expect(res.error).toBeUndefined();
  });

  test("action returns auth error response", async () => {
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ error: "no", status: 401 });
    const mod = await import("../app/routes/api+/chat_sms");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "no" });
  });

  test("action api_key rejects workspace mismatch", async () => {
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "api_key", workspaceId: TEST_WORKSPACE_ID, keyId: "k1", scopes: ["messages.send"], client: {} });
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      to_number: "15551234567",
      workspace_id: TEST_WORKSPACE_ID_ALT,
      contact_id: "",
      caller_id: "+1555",
      body: "hi",
      media: "[]",
    });
    const mod = await import("../app/routes/api+/chat_sms");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(403);
  });

  test("action returns 402 with creditsError when workspace balance is depleted", async () => {
    mocks.getWorkspaceCreditsBalance.mockResolvedValueOnce(0);
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "api_key", workspaceId: TEST_WORKSPACE_ID, keyId: "k1", scopes: ["messages.send"], client: {} });
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      to_number: "+15551234567",
      workspace_id: TEST_WORKSPACE_ID,
      contact_id: "",
      caller_id: "+1555",
      body: "hi",
      media: "[]",
    });
    const mod = await import("../app/routes/api+/chat_sms");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(402);
    await expect(res.json()).resolves.toEqual({
      creditsError: true,
      error: "Insufficient credits",
    });
  });

  test("action returns 402 with creditsError when workspace balance is unknown (fail closed)", async () => {
    mocks.getWorkspaceCreditsBalance.mockResolvedValueOnce(null);
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "api_key", workspaceId: TEST_WORKSPACE_ID, keyId: "k1", scopes: ["messages.send"], client: {} });
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      to_number: "+15551234567",
      workspace_id: TEST_WORKSPACE_ID,
      contact_id: "",
      caller_id: "+1555",
      body: "hi",
      media: "[]",
    });
    const mod = await import("../app/routes/api+/chat_sms");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(402);
    await expect(res.json()).resolves.toEqual({
      creditsError: true,
      error: "Insufficient credits",
    });
  });

  test("action api_key success path uses authResult.client and user null; covers '+' not at start normalization", async () => {
    const client = makeDbClientStub({ webhookRows: [] });
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "api_key", workspaceId: TEST_WORKSPACE_ID, client: {}, keyId: "k1", scopes: ["messages.send"]});
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      to_number: "1+5551234567",
      workspace_id: TEST_WORKSPACE_ID,
      contact_id: "",
      caller_id: "+15551234567",
      body: "",
      media: "[]",
    });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      messages: { create: vi.fn(async () => ({ sid: "SM1", body: " " })) },
    });
    const mod = await import("../app/routes/api+/chat_sms");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(201);
  });

  test("action session requires workspace access and returns 404 on invalid phone number", async () => {
    const dbClient = makeDbClientStub({});
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "session",  user: { id: "u1" } });
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      to_number: "123",
      workspace_id: TEST_WORKSPACE_ID,
      contact_id: "",
      caller_id: "+1555",
      body: "hi",
      media: "[]",
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);
    const mod = await import("../app/routes/api+/chat_sms");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(404);
    expect(mocks.logger.error).toHaveBeenCalledWith("Invalid phone number:", expect.anything());
  });

  test("action skips template processing when contact lookup errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "x" })) as any);
    const dbClient = makeDbClientStub({
      contactRow: null,
      contactError: { message: "nope" },
      webhookRows: [],
    });
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "session",  user: { id: "u1" } });
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      to_number: "+15551234567",
      workspace_id: TEST_WORKSPACE_ID,
      contact_id: "1",
      caller_id: "+15551234567",
      body: "Hello {{firstname}}",
      media: "[]",
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      messages: { create: vi.fn(async () => ({ sid: "SM1", body: "Hello {{firstname}}" })) },
    });

    const mod = await import("../app/routes/api+/chat_sms");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(201);
    expect(mocks.processTemplateTags).not.toHaveBeenCalled();
  });

  test("action processes template tags when contact found and returns 201", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "x" })) as any);
    const dbClient = makeDbClientStub({
      contactRow: { firstname: "A" },
      webhookRows: [],
    });
    // Not mockResolvedValueOnce: the opt-out gate does its own contact lookup
    // before the template-tag branch fetches the contact again.
    tenantDbMocks.contact.findFirst.mockResolvedValue({ firstname: "A", opt_out: false });
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "session",  user: { id: "u1" } });
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      to_number: "+1 (555) 123-4567",
      workspace_id: TEST_WORKSPACE_ID,
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

    const mod = await import("../app/routes/api+/chat_sms");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ data: [{ id: 1 }], message: expect.anything() });
    expect(mocks.processTemplateTags).toHaveBeenCalled();
  });

  test("action uses messaging service mode and message intent overrides", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "x" })) as any);
    const dbClient = makeDbClientStub({
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
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "session",  user: { id: "u1" } });
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      to_number: "+15551234567",
      workspace_id: TEST_WORKSPACE_ID,
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

    const mod = await import("../app/routes/api+/chat_sms");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
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
    const dbClient = makeDbClientStub({});
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ authType: "session",  user: { id: "u1" } });
    mocks.parseJsonBodyOrResponse.mockResolvedValueOnce({
      to_number: "+15551234567",
      workspace_id: TEST_WORKSPACE_ID,
      contact_id: "",
      caller_id: "+15551234567",
      body: "",
      media: "[]",
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);
    mocks.createWorkspaceTwilioInstance.mockRejectedValueOnce(new Error("twilio"));

    const mod = await import("../app/routes/api+/chat_sms");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(500);
    expect(mocks.logger.error).toHaveBeenCalledWith("Error in chat_sms action:", expect.anything());
  });

  test("returns 400 when request body fails schema validation", async () => {
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({
      authType: "api_key",
      workspaceId: "550e8400-e29b-41d4-a716-446655440000",
      client: {},
      keyId: "k1",
      scopes: ["messages.send"],
    });
    mocks.parseJsonBodyOrResponse.mockImplementation(async (request, schema) => {
      const actual = await vi.importActual<typeof import("@/lib/api-parse.server")>(
        "@/lib/api-parse.server",
      );
      return actual.parseJsonBodyOrResponse(request, schema);
    });
    const mod = await import("../app/routes/api+/chat_sms");
    const res = await asRouteResponse(mod.action({
        request: new Request("http://x", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspace_id: "not-a-uuid", to_number: "" }),
        }),
      } as any),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringMatching(/workspace_id|to_number|caller_id|body/),
    });
  });
});

