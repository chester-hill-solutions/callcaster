import { beforeEach, describe, expect, test, vi } from "vitest";

let currentSupabase: any = null;
const defaultPortalConfig = {
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
};

const mocks = vi.hoisted(() => {
  return {
    createClient: vi.fn(() => currentSupabase),
    verifyApiKeyOrSession: vi.fn(),
    safeParseJson: vi.fn(),
    getCampaignQueueById: vi.fn(),
    getWorkspaceTwilioPortalConfig: vi.fn(),
    createWorkspaceTwilioInstance: vi.fn(),
    requireWorkspaceAccess: vi.fn(),
    processTemplateTags: vi.fn((text: string) => text),
    env: {
      SUPABASE_URL: vi.fn(() => "http://supabase"),
      SUPABASE_SERVICE_KEY: vi.fn(() => "service-key"),
    },
    logger: { error: vi.fn() },
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: any[]) => mocks.createClient(...args),
}));

vi.mock("@/lib/api-auth.server", () => ({
  verifyApiKeyOrSession: (...args: any[]) => mocks.verifyApiKeyOrSession(...args),
}));

vi.mock("../app/lib/database.server", () => ({
  safeParseJson: (...args: any[]) => mocks.safeParseJson(...args),
  getCampaignQueueById: (...args: any[]) => mocks.getCampaignQueueById(...args),
  getWorkspaceTwilioPortalConfig: (...args: any[]) => mocks.getWorkspaceTwilioPortalConfig(...args),
  createWorkspaceTwilioInstance: (...args: any[]) => mocks.createWorkspaceTwilioInstance(...args),
  requireWorkspaceAccess: (...args: any[]) => mocks.requireWorkspaceAccess(...args),
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

vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

function makeSupabase(opts: {
  campaign?: any;
  campaignError?: any;
  rpcResult?: { data: any; error: any };
  outreachUpdate?: { data: any; error: any };
  messageInsert?: any;
  queueUpdate?: any;
  signedUrls?: Array<string | undefined>;
} = {}) {
  const signedUrls = opts.signedUrls ?? [];
  let signedUrlIdx = 0;

  return {
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn(async () => {
          const signedUrl = signedUrls[signedUrlIdx++];
          return { data: signedUrl ? { signedUrl } : null };
        }),
      })),
    },
    rpc: vi.fn(async () => opts.rpcResult ?? { data: "oa1", error: null }),
    from: vi.fn((table: string) => {
      if (table === "message_campaign") {
        const single = vi.fn(async () => ({
          data:
            opts.campaign ??
            ({
              body_text: "hi",
              message_media: [],
              campaign: { end_time: new Date().toISOString() },
            } as any),
          error: opts.campaignError ?? null,
        }));
        const q: any = {
          select: () => q,
          eq: () => q,
          single,
        };
        return q;
      }
      if (table === "outreach_attempt") {
        return {
          update: () => ({
            eq: vi.fn(async () => opts.outreachUpdate ?? { data: [], error: null }),
          }),
        };
      }
      if (table === "message") {
        return {
          insert: () => ({
            select: vi.fn(async () => opts.messageInsert ?? ({ data: [], error: null } as any)),
          }),
        };
      }
      if (table === "campaign_queue") {
        return {
          update: () => ({
            eq: vi.fn(async () => opts.queueUpdate ?? ({ data: [], error: null } as any)),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

describe("app/routes/api.sms.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyApiKeyOrSession.mockReset();
    mocks.safeParseJson.mockReset();
    mocks.getCampaignQueueById.mockReset();
    mocks.getWorkspaceTwilioPortalConfig.mockReset();
    mocks.createWorkspaceTwilioInstance.mockReset();
    mocks.requireWorkspaceAccess.mockReset();
    mocks.processTemplateTags.mockReset();
    mocks.logger.error.mockReset();
    mocks.createClient.mockClear();
    mocks.verifyApiKeyOrSession.mockResolvedValue({
      authType: "api_key",
      workspaceId: "w1",
      supabase: {},
    });
    mocks.getWorkspaceTwilioPortalConfig.mockResolvedValue(defaultPortalConfig);

    (globalThis as any).fetch = vi.fn(async () => ({ ok: true, text: async () => "http://tiny" }));
  });

  test("returns auth error response", async () => {
    currentSupabase = makeSupabase({});
    mocks.verifyApiKeyOrSession.mockResolvedValueOnce({ error: "Unauthorized", status: 401 });
    const mod = await import("../app/routes/api.sms");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  test("rejects api_key workspace mismatch", async () => {
    currentSupabase = makeSupabase({});
    mocks.safeParseJson.mockResolvedValueOnce({
      campaign_id: "c1",
      workspace_id: "w2",
      caller_id: "+15551234567",
      user_id: "u1",
    });
    const mod = await import("../app/routes/api.sms");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "workspace_id does not match API key" });
  });

  test("happy path shortens URLs, signs media, templates body, and sends with mediaUrl", async () => {
    currentSupabase = makeSupabase({
      campaign: {
        body_text: "Hello https://example.com",
        message_media: ["m1.png"],
        campaign: { end_time: new Date().toISOString() },
      },
      signedUrls: ["http://signed-1"],
    });

    mocks.safeParseJson.mockResolvedValueOnce({
      campaign_id: "c1",
      workspace_id: "w1",
      caller_id: "+15551234567",
      user_id: "u1",
    });

    mocks.getCampaignQueueById.mockResolvedValueOnce([
      { id: 10, contact_id: 1, contact: { phone: "5551234567", firstname: "A" } },
    ]);

    mocks.processTemplateTags.mockReturnValueOnce("Hello https://example.com A");

    const create = vi.fn(async (args: any) => ({
      sid: "SM1",
      body: args.body,
      numSegments: 1,
      direction: "outbound-api",
      from: args.from,
      to: args.to,
      dateUpdated: "x",
      price: "0",
      errorMessage: null,
      accountSid: "AC",
      uri: "/",
      numMedia: "1",
      status: "sent",
      messagingServiceSid: null,
      dateSent: "x",
      errorCode: null,
      priceUnit: "USD",
      apiVersion: "2010-04-01",
      subresourceUris: {},
    }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ messages: { create } });

    const mod = await import("../app/routes/api.sms");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("responses");

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("http://tiny"),
        mediaUrl: ["http://signed-1"],
      })
    );
  });

  test("no URLs and no media: does not include mediaUrl; skips template tags when body_text empty", async () => {
    currentSupabase = makeSupabase({
      campaign: {
        body_text: "",
        message_media: undefined,
        campaign: { end_time: new Date().toISOString() },
      },
    });
    mocks.safeParseJson.mockResolvedValueOnce({
      campaign_id: "c2",
      workspace_id: "w1",
      caller_id: "+15551234567",
      user_id: "u1",
    });
    mocks.getCampaignQueueById.mockResolvedValueOnce([
      { id: 11, contact_id: 2, contact: { phone: "+15551234567" } },
    ]);
    const create = vi.fn(async (args: any) => ({ sid: "SM2", body: args.body }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ messages: { create } });

    const mod = await import("../app/routes/api.sms");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(200);
    expect(mocks.processTemplateTags).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(expect.not.objectContaining({ mediaUrl: expect.anything() }));
  });

  test("twilio send failure returns per-member success=false but overall 200", async () => {
    currentSupabase = makeSupabase({
      campaign: { body_text: "Hi", message_media: [], campaign: { end_time: new Date().toISOString() } },
    });
    mocks.safeParseJson.mockResolvedValueOnce({
      campaign_id: "c3",
      workspace_id: "w1",
      caller_id: "+15551234567",
      user_id: "u1",
    });
    mocks.getCampaignQueueById.mockResolvedValueOnce([
      { id: 12, contact_id: 3, contact: { phone: "+15551234567" } },
    ]);
    const create = vi.fn(async () => {
      throw new Error("twilio");
    });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ messages: { create } });

    const mod = await import("../app/routes/api.sms");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.responses[0]).toHaveProperty("3");
    expect(body.responses[0]["3"].success).toBe(false);
    expect(body.responses[0]["3"].error).toBe("twilio");
  });

  test("createOutreachAttempt rpc error returns per-member success=false", async () => {
    currentSupabase = makeSupabase({
      rpcResult: { data: null, error: { message: "rpc-bad" } },
      campaign: { body_text: "Hi", message_media: [], campaign: { end_time: new Date().toISOString() } },
    });
    mocks.safeParseJson.mockResolvedValueOnce({
      campaign_id: "c4",
      workspace_id: "w1",
      caller_id: "+15551234567",
      user_id: "u1",
    });
    mocks.getCampaignQueueById.mockResolvedValueOnce([
      { id: 13, contact_id: 4, contact: { phone: "+15551234567" } },
    ]);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      messages: { create: vi.fn(async () => ({ sid: "SM4", body: "Hi" })) },
    });

    const mod = await import("../app/routes/api.sms");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.responses[0]["4"].success).toBe(false);
    expect(body.responses[0]["4"].error).toBe("rpc-bad");
  });

  test("updateOutreach error returns per-member success=false", async () => {
    currentSupabase = makeSupabase({
      outreachUpdate: { data: null, error: { message: "update-bad" } },
      campaign: { body_text: "Hi", message_media: [], campaign: { end_time: new Date().toISOString() } },
    });
    mocks.safeParseJson.mockResolvedValueOnce({
      campaign_id: "c5",
      workspace_id: "w1",
      caller_id: "+15551234567",
      user_id: "u1",
    });
    mocks.getCampaignQueueById.mockResolvedValueOnce([
      { id: 14, contact_id: 5, contact: { phone: "+15551234567" } },
    ]);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      messages: { create: vi.fn(async () => ({ sid: "SM5", body: "Hi" })) },
    });

    const mod = await import("../app/routes/api.sms");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.responses[0]["5"].success).toBe(false);
    expect(body.responses[0]["5"].error).toBe("update-bad");
  });

  test("shortenUrl fetch throws logs and keeps original URL", async () => {
    (globalThis as any).fetch = vi.fn(async () => {
      throw new Error("no-network");
    });
    currentSupabase = makeSupabase({
      campaign: { body_text: "Go https://example.com", message_media: [], campaign: { end_time: new Date().toISOString() } },
    });
    mocks.safeParseJson.mockResolvedValueOnce({
      campaign_id: "c6",
      workspace_id: "w1",
      caller_id: "+15551234567",
      user_id: "u1",
    });
    mocks.getCampaignQueueById.mockResolvedValueOnce([
      { id: 15, contact_id: 6, contact: { phone: "+15551234567" } },
    ]);
    const create = vi.fn(async (args: any) => ({ sid: "SM6", body: args.body }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ messages: { create } });

    const mod = await import("../app/routes/api.sms");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(200);
    expect(mocks.logger.error).toHaveBeenCalledWith("Error shortening URL:", expect.anything());
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringContaining("https://example.com") }));
  });

  test("shortenUrl non-ok response keeps original URL", async () => {
    (globalThis as any).fetch = vi.fn(async () => ({ ok: false, text: async () => "ignored" }));
    currentSupabase = makeSupabase({
      campaign: { body_text: "Go https://example.com", message_media: [], campaign: { end_time: new Date().toISOString() } },
    });
    mocks.safeParseJson.mockResolvedValueOnce({
      campaign_id: "c6b",
      workspace_id: "w1",
      caller_id: "+15551234567",
      user_id: "u1",
    });
    mocks.getCampaignQueueById.mockResolvedValueOnce([
      { id: 15, contact_id: 6, contact: { phone: "+15551234567" } },
    ]);
    const create = vi.fn(async (args: any) => ({ sid: "SM6b", body: args.body }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ messages: { create } });

    const mod = await import("../app/routes/api.sms");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringContaining("https://example.com") }));
  });

  test("message.sid falsy uses failed-* fallback", async () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(123);
    currentSupabase = makeSupabase({
      campaign: { body_text: "Hi", message_media: [], campaign: { end_time: new Date().toISOString() } },
    });
    mocks.safeParseJson.mockResolvedValueOnce({
      campaign_id: "c7",
      workspace_id: "w1",
      caller_id: "+15551234567",
      user_id: "u1",
    });
    mocks.getCampaignQueueById.mockResolvedValueOnce([
      { id: 16, contact_id: 7, contact: { phone: "+15551234567" } },
    ]);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      messages: { create: vi.fn(async () => ({ sid: "", body: "Hi", to: "+15551234567" })) },
    });

    // observe insert payload sid
    const inserted: any[] = [];
    currentSupabase.from = vi.fn((table: string) => {
      if (table === "message_campaign") return makeSupabase({ campaign: { body_text: "Hi", message_media: [], campaign: { end_time: "" } } }).from("message_campaign");
      if (table === "outreach_attempt") return makeSupabase({}).from("outreach_attempt");
      if (table === "campaign_queue") return makeSupabase({}).from("campaign_queue");
      if (table === "message") {
        return {
          insert: (row: any) => {
            inserted.push(row);
            return { select: vi.fn(async () => ({ data: [], error: null })) };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const mod = await import("../app/routes/api.sms");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(200);
    expect(inserted[0].sid).toBe("failed-+15551234567-123");
    (Date.now as any).mockRestore?.();
  });

  test("uses messaging service and explicit message intent overrides", async () => {
    currentSupabase = makeSupabase({
      campaign: { body_text: "Priority update", message_media: [], campaign: { end_time: new Date().toISOString() } },
    });
    mocks.safeParseJson.mockResolvedValueOnce({
      campaign_id: "c10",
      workspace_id: "w1",
      caller_id: "+15551234567",
      user_id: "u1",
      message_intent: "fraud",
      messaging_service_sid: "MGOVERRIDE",
    });
    mocks.getCampaignQueueById.mockResolvedValueOnce([
      { id: 19, contact_id: 11, contact: { phone: "+15551234567" } },
    ]);
    mocks.getWorkspaceTwilioPortalConfig.mockResolvedValueOnce({
      ...defaultPortalConfig,
      sendMode: "messaging_service",
      messagingServiceSid: "MGDEFAULT",
      defaultMessageIntent: "notifications",
    });

    const create = vi.fn(async (args: any) => ({
      sid: "SM10",
      body: args.body,
      numSegments: 1,
      direction: "outbound-api",
      from: null,
      to: args.to,
      dateUpdated: "x",
      price: "0",
      errorMessage: null,
      accountSid: "AC",
      uri: "/",
      numMedia: "0",
      status: "queued",
      messagingServiceSid: args.messagingServiceSid,
      dateSent: "x",
      errorCode: null,
      priceUnit: "USD",
      apiVersion: "2010-04-01",
      subresourceUris: {},
    }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ messages: { create } });

    const mod = await import("../app/routes/api.sms");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        messagingServiceSid: "MGOVERRIDE",
        messageIntent: "fraud",
      }),
    );
    expect(create).toHaveBeenCalledWith(expect.not.objectContaining({ from: expect.anything() }));
  });

  test("campaign fetch error returns 500", async () => {
    currentSupabase = makeSupabase({
      campaignError: { message: "nope" },
    });
    mocks.safeParseJson.mockResolvedValueOnce({
      campaign_id: "c8",
      workspace_id: "w1",
      caller_id: "+15551234567",
      user_id: "u1",
    });
    mocks.getCampaignQueueById.mockResolvedValueOnce([]);

    const mod = await import("../app/routes/api.sms");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Campaign fetch failed:");
  });

  test("normalizePhoneNumber throw (bad contact phone) triggers overall 500", async () => {
    currentSupabase = makeSupabase({
      campaign: { body_text: "Hi", message_media: [], campaign: { end_time: new Date().toISOString() } },
    });
    mocks.safeParseJson.mockResolvedValueOnce({
      campaign_id: "c9",
      workspace_id: "w1",
      caller_id: "+15551234567",
      user_id: "u1",
    });
    mocks.getCampaignQueueById.mockResolvedValueOnce([
      { id: 17, contact_id: 9, contact: { phone: "123" } },
    ]);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      messages: { create: vi.fn(async () => ({ sid: "SM9", body: "Hi" })) },
    });

    const mod = await import("../app/routes/api.sms");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(500);
  });

  test("missing contact.phone uses '' fallback and triggers overall 500", async () => {
    currentSupabase = makeSupabase({
      campaign: { body_text: "Hi", message_media: [], campaign: { end_time: new Date().toISOString() } },
    });
    mocks.safeParseJson.mockResolvedValueOnce({
      campaign_id: "c9b",
      workspace_id: "w1",
      caller_id: "+15551234567",
      user_id: "u1",
    });
    mocks.getCampaignQueueById.mockResolvedValueOnce([
      { id: 18, contact_id: 10, contact: { phone: "" } },
    ]);
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      messages: { create: vi.fn(async () => ({ sid: "SM9b", body: "Hi" })) },
    });

    const mod = await import("../app/routes/api.sms");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(500);
  });

  test("safeParseJson throws returns 500 with Unknown error handling", async () => {
    currentSupabase = makeSupabase({});
    mocks.safeParseJson.mockRejectedValueOnce("nope");
    const mod = await import("../app/routes/api.sms");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Unknown error" });
  });
});

