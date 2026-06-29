import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  validateTwilioWebhookForMessageSid: vi.fn(),
  insertTransactionHistoryIdempotent: vi.fn(),
  cancelQueuedMessagesForCampaign: vi.fn(),
  createWorkspaceTwilioInstance: vi.fn(async () => ({})),
  shouldUpdateOutreachDisposition: vi.fn(),
  env: {
    SUPABASE_URL: vi.fn(() => "http://supabase"),
    SUPABASE_SERVICE_KEY: vi.fn(() => "service"),
    TWILIO_SID: vi.fn(() => "sid"),
    TWILIO_AUTH_TOKEN: vi.fn(() => "token"),
  },
  logger: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const twilioCtor = vi.fn(function (this: unknown) {
  return {};
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => mocks.createClient(...args),
}));
vi.mock("twilio", () => ({ default: { Twilio: twilioCtor } }));
vi.mock("@/lib/twilio-webhook.server", () => ({
  validateTwilioWebhookForMessageSid: (...args: unknown[]) =>
    mocks.validateTwilioWebhookForMessageSid(...args),
}));
vi.mock("@/lib/transaction-history.server", () => ({
  insertTransactionHistoryIdempotent: (...args: unknown[]) =>
    mocks.insertTransactionHistoryIdempotent(...args),
}));
vi.mock("@/lib/database.server", () => ({
  cancelQueuedMessagesForCampaign: (...args: unknown[]) =>
    mocks.cancelQueuedMessagesForCampaign(...args),
  createWorkspaceTwilioInstance: (...args: unknown[]) =>
    mocks.createWorkspaceTwilioInstance(...args),
}));
vi.mock("@/lib/outreach-disposition", () => ({
  shouldUpdateOutreachDisposition: (...args: unknown[]) =>
    mocks.shouldUpdateOutreachDisposition(...args),
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

function makeSupabase(opts: {
  messagePreload?: { data: unknown; error: unknown };
  messageUpdate?: { data: unknown; error: unknown };
  attemptSelect?: { data: unknown; error: unknown };
  outreachUpdate?: { data: unknown; error: unknown };
  webhookSelect?: { data: unknown; error: unknown };
}) {
  const messagePreload = opts.messagePreload ?? {
    data: {
      workspace: "w1",
      direction: "outbound-api",
      sid: "SM1",
      outreach_attempt_id: null,
      campaign_id: null,
    },
    error: null,
  };
  const messageUpdate = opts.messageUpdate ?? { data: null, error: null };
  const attemptSelect = opts.attemptSelect ?? { data: null, error: null };
  const outreachUpdate = opts.outreachUpdate ?? { data: null, error: null };
  const webhookSelect = opts.webhookSelect ?? { data: [], error: null };

  const from = vi.fn((table: string) => {
    if (table === "message") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => messagePreload,
          }),
        }),
        update: () => ({
          eq: () => ({
            select: () => ({
              single: async () => messageUpdate,
            }),
          }),
        }),
      };
    }
    if (table === "outreach_attempt") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => attemptSelect,
          }),
        }),
        update: () => ({
          eq: () => ({
            select: () => ({
              single: async () => outreachUpdate,
            }),
          }),
        }),
      };
    }
    if (table === "webhook") {
      return {
        select: () => ({
          eq: () => ({
            filter: async () => webhookSelect,
          }),
        }),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return { from };
}

function makeSmsStatusRequest(payload: { SmsSid?: string; SmsStatus?: string }) {
  const formData = new FormData();
  if (payload.SmsSid !== undefined) {
    formData.set("SmsSid", payload.SmsSid);
  }
  if (payload.SmsStatus !== undefined) {
    formData.set("SmsStatus", payload.SmsStatus);
  }

  return new Request("http://x", { method: "POST", body: formData });
}

describe("app/routes/api+/sms/status.route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    twilioCtor.mockClear();
    mocks.createClient.mockReset();
    mocks.validateTwilioWebhookForMessageSid.mockReset();
    mocks.validateTwilioWebhookForMessageSid.mockImplementation(async (args: {
      params?: Record<string, string>;
    }) => ({
      ok: true,
      params: args.params ?? {},
      authToken: "workspace-token",
    }));
    mocks.insertTransactionHistoryIdempotent.mockReset();
    mocks.cancelQueuedMessagesForCampaign.mockReset();
    mocks.createWorkspaceTwilioInstance.mockReset();
    mocks.createWorkspaceTwilioInstance.mockResolvedValue({});
    mocks.shouldUpdateOutreachDisposition.mockReset();
    mocks.logger.error.mockReset();
  });

  test("returns 403 when webhook validation fails", async () => {
    mocks.createClient.mockReturnValueOnce(makeSupabase({}));
    mocks.validateTwilioWebhookForMessageSid.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ error: "Invalid Twilio signature" }), {
        status: 403,
      }),
    });

    const mod = await import("../app/routes/api+/sms/status.route");
    const res = await asRouteResponse(
      await mod.action({
        request: makeSmsStatusRequest({ SmsSid: "SM1", SmsStatus: "sent" }),
      } as never),
    );
    expect(res.status).toBe(403);
  });

  test("returns 400 when SmsSid or status missing", async () => {
    mocks.createClient.mockReturnValueOnce(makeSupabase({}));

    const mod = await import("../app/routes/api+/sms/status.route");
    const res = await asRouteResponse(
      await mod.action({
        request: makeSmsStatusRequest({ SmsSid: "SM1" }),
      } as never),
    );
    expect(res.status).toBe(400);
  });

  test("accepts MessageStatus when SmsStatus is absent", async () => {
    const supabase = makeSupabase({
      messagePreload: {
        data: {
          workspace: "w1",
          direction: "outbound-api",
          sid: "SM1",
          outreach_attempt_id: null,
          campaign_id: null,
        },
        error: null,
      },
      messageUpdate: {
        data: {
          sid: "SM1",
          workspace: "w1",
          status: "delivered",
          outreach_attempt_id: null,
          campaign_id: null,
        },
        error: null,
      },
    });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.validateTwilioWebhookForMessageSid.mockResolvedValueOnce({
      ok: true,
      params: { SmsSid: "SM1", MessageStatus: "delivered" },
      authToken: "workspace-token",
    });

    const formData = new FormData();
    formData.set("SmsSid", "SM1");
    formData.set("MessageStatus", "delivered");

    const mod = await import("../app/routes/api+/sms/status.route");
    const res = await asRouteResponse(
      await mod.action({
        request: new Request("http://x", { method: "POST", body: formData }),
      } as never),
    );
    expect(res.status).toBe(200);
  });

  test("returns 500 when message lookup fails after validation", async () => {
    mocks.createClient.mockReturnValueOnce(
      makeSupabase({
        messagePreload: { data: null, error: { message: "missing" } },
      }),
    );
    mocks.validateTwilioWebhookForMessageSid.mockResolvedValueOnce({
      ok: true,
      params: { SmsSid: "SM1", SmsStatus: "sent" },
      authToken: "workspace-token",
    });

    const mod = await import("../app/routes/api+/sms/status.route");
    const res = await asRouteResponse(
      await mod.action({
        request: makeSmsStatusRequest({ SmsSid: "SM1", SmsStatus: "sent" }),
      } as never),
    );
    expect(res.status).toBe(500);
  });

  test("returns 200 without updating DB when message is inbound", async () => {
    const supabase = makeSupabase({
      messagePreload: {
        data: {
          sid: "SM1",
          workspace: "w1",
          direction: "inbound",
          status: "received",
        },
        error: null,
      },
      messageUpdate: { data: null, error: { message: "update should not run" } },
    });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.validateTwilioWebhookForMessageSid.mockResolvedValueOnce({
      ok: true,
      params: { SmsSid: "SM1", SmsStatus: "sent" },
      authToken: "workspace-token",
    });

    const mod = await import("../app/routes/api+/sms/status.route");
    const res = await asRouteResponse(
      await mod.action({
        request: makeSmsStatusRequest({ SmsSid: "SM1", SmsStatus: "sent" }),
      } as never),
    );
    expect(res.status).toBe(200);
  });
});
