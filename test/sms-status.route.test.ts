import { beforeEach, describe, expect, test, vi } from "vitest";

const twilioCtor = vi.fn(function (this: any) {
  return {};
});

const mocks = vi.hoisted(() => {
  return {
    createClient: vi.fn(),
    validateTwilioWebhook: vi.fn(),
    insertTransactionHistoryIdempotent: vi.fn(),
    cancelQueuedMessagesForCampaign: vi.fn(),
    shouldUpdateOutreachDisposition: vi.fn(),
    env: {
      SUPABASE_URL: vi.fn(() => "http://supabase"),
      SUPABASE_SERVICE_KEY: vi.fn(() => "service"),
      TWILIO_SID: vi.fn(() => "sid"),
      TWILIO_AUTH_TOKEN: vi.fn(() => "token"),
    },
    logger: { error: vi.fn(), debug: vi.fn() },
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: any[]) => mocks.createClient(...args),
}));
vi.mock("twilio", () => ({ default: { Twilio: twilioCtor } }));
vi.mock("@/twilio.server", () => ({
  validateTwilioWebhook: (...args: any[]) => mocks.validateTwilioWebhook(...args),
}));
vi.mock("@/lib/transaction-history.server", () => ({
  insertTransactionHistoryIdempotent: (...args: any[]) => mocks.insertTransactionHistoryIdempotent(...args),
}));
vi.mock("@/lib/database.server", () => ({
  cancelQueuedMessagesForCampaign: (...args: any[]) =>
    mocks.cancelQueuedMessagesForCampaign(...args),
}));
vi.mock("@/lib/outreach-disposition", () => ({
  shouldUpdateOutreachDisposition: (...args: any[]) => mocks.shouldUpdateOutreachDisposition(...args),
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

function makeSupabase(opts: {
  messagePreload?: { data: any; error: any };
  messageUpdate?: { data: any; error: any };
  workspaceLookup?: { data: any; error: any };
  attemptSelect?: { data: any; error: any };
  outreachUpdate?: { data: any; error: any };
  webhookSelect?: { data: any; error: any };
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
  const workspaceLookup =
    opts.workspaceLookup ??
    { data: { twilio_data: { authToken: "workspace-token" } }, error: null };
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
    if (table === "workspace") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => workspaceLookup,
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

function makeSmsStatusRequest(payload: {
  SmsSid?: string;
  SmsStatus?: string;
}) {
  const formData = new FormData();
  if (payload.SmsSid !== undefined) {
    formData.set("SmsSid", payload.SmsSid);
  }
  if (payload.SmsStatus !== undefined) {
    formData.set("SmsStatus", payload.SmsStatus);
  }

  return new Request("http://x", { method: "POST", body: formData });
}

describe("app/routes/api.sms.status.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    twilioCtor.mockClear();

    mocks.createClient.mockReset();
    mocks.validateTwilioWebhook.mockReset();
    mocks.insertTransactionHistoryIdempotent.mockReset();
    mocks.cancelQueuedMessagesForCampaign.mockReset();
    mocks.shouldUpdateOutreachDisposition.mockReset();
    mocks.env.SUPABASE_URL.mockClear();
    mocks.env.SUPABASE_SERVICE_KEY.mockClear();
    mocks.env.TWILIO_SID.mockClear();
    mocks.env.TWILIO_AUTH_TOKEN.mockClear();
    mocks.logger.error.mockReset();
    mocks.logger.debug.mockReset();
  });

  test("returns Response from validateTwilioWebhook when invalid", async () => {
    const supabase = makeSupabase({ messageUpdate: { data: null, error: null } });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.validateTwilioWebhook.mockResolvedValueOnce(new Response("no", { status: 403 }));

    const mod = await import("../app/routes/api.sms.status");
    const res = await mod.action({
      request: makeSmsStatusRequest({ SmsSid: "SM1", SmsStatus: "sent" }),
    } as any);
    expect(res.status).toBe(403);
    expect(mocks.validateTwilioWebhook).toHaveBeenCalledWith(
      expect.any(Request),
      "workspace-token",
    );
  });

  test("returns 400 when SmsSid or SmsStatus missing", async () => {
    const supabase = makeSupabase({ messageUpdate: { data: null, error: null } });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.validateTwilioWebhook.mockResolvedValueOnce({ params: { SmsSid: "SM1" } });

    const mod = await import("../app/routes/api.sms.status");
    const res = await mod.action({
      request: makeSmsStatusRequest({ SmsSid: "SM1" }),
    } as any);
    expect(res.status).toBe(400);
  });

  test("returns 500 when message workspace lookup fails before validation", async () => {
    const supabase = makeSupabase({
      messagePreload: { data: null, error: { message: "missing" } },
    });
    mocks.createClient.mockReturnValueOnce(supabase);

    const fd = new FormData();
    fd.set("SmsSid", "SM1");
    fd.set("SmsStatus", "sent");

    const mod = await import("../app/routes/api.sms.status");
    const res = await mod.action({
      request: new Request("http://x", { method: "POST", body: fd }),
    } as any);
    expect(res.status).toBe(500);
    expect(mocks.validateTwilioWebhook).not.toHaveBeenCalled();
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
    mocks.validateTwilioWebhook.mockResolvedValueOnce({
      params: { SmsSid: "SM1", SmsStatus: "delivered" },
    });

    const mod = await import("../app/routes/api.sms.status");
    const res = await mod.action({
      request: makeSmsStatusRequest({ SmsSid: "SM1", SmsStatus: "delivered" }),
    } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message.direction).toBe("inbound");
    expect(body.outreach).toBeNull();
    expect(mocks.insertTransactionHistoryIdempotent).not.toHaveBeenCalled();
  });

  test("returns 500 when message update errors", async () => {
    const supabase = makeSupabase({
      messageUpdate: { data: null, error: { message: "db" } },
    });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.validateTwilioWebhook.mockResolvedValueOnce({ params: { SmsSid: "SM1", SmsStatus: "sent" } });

    const mod = await import("../app/routes/api.sms.status");
    const res = await mod.action({
      request: makeSmsStatusRequest({ SmsSid: "SM1", SmsStatus: "sent" }),
    } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Failed to update message" });
    expect(mocks.logger.error).toHaveBeenCalledWith("Error updating message:", { message: "db" });
  });

  test("defaults invalid status to failed and attempts billing (billing failure logs only)", async () => {
    const supabase = makeSupabase({
      messageUpdate: { data: { sid: "SM1", workspace: "w1" }, error: null },
    });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.validateTwilioWebhook.mockResolvedValueOnce({ params: { SmsSid: "SM1", SmsStatus: "not-a-status" } });
    mocks.insertTransactionHistoryIdempotent.mockRejectedValueOnce(new Error("tx"));

    const mod = await import("../app/routes/api.sms.status");
    const res = await mod.action({
      request: makeSmsStatusRequest({ SmsSid: "SM1", SmsStatus: "not-a-status" }),
    } as any);
    expect(res.status).toBe(200);
    expect(mocks.insertTransactionHistoryIdempotent).toHaveBeenCalled();
    expect(mocks.logger.error).toHaveBeenCalledWith("Failed to create SMS transaction:", expect.anything());
  });

  test("outreach attempt disposition: shouldSkip avoids update", async () => {
    const supabase = makeSupabase({
      messageUpdate: { data: { sid: "SM1", outreach_attempt_id: 1, workspace: "w1" }, error: null },
      attemptSelect: { data: { disposition: "completed" }, error: null },
    });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.validateTwilioWebhook.mockResolvedValueOnce({ params: { SmsSid: "SM1", SmsStatus: "delivered" } });
    mocks.shouldUpdateOutreachDisposition.mockReturnValueOnce(false);

    const mod = await import("../app/routes/api.sms.status");
    const res = await mod.action({
      request: makeSmsStatusRequest({ SmsSid: "SM1", SmsStatus: "delivered" }),
    } as any);
    expect(res.status).toBe(200);
  });

  test("outreach update error logs; outreach success triggers campaign-scoped cancellation when campaign ended", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const supabase1 = makeSupabase({
      messageUpdate: { data: { sid: "SM1", outreach_attempt_id: 1 }, error: null },
      attemptSelect: { data: { disposition: null }, error: null },
      outreachUpdate: { data: null, error: { message: "outreach" } },
    });
    mocks.createClient.mockReturnValueOnce(supabase1);
    mocks.validateTwilioWebhook.mockResolvedValueOnce({ params: { SmsSid: "SM1", SmsStatus: "failed" } });
    mocks.shouldUpdateOutreachDisposition.mockReturnValueOnce(true);
    const mod = await import("../app/routes/api.sms.status");
    const r1 = await mod.action({
      request: makeSmsStatusRequest({ SmsSid: "SM1", SmsStatus: "failed" }),
    } as any);
    expect(r1.status).toBe(200);
    expect(mocks.logger.error).toHaveBeenCalledWith("Error updating outreach attempt:", { message: "outreach" });

    const supabase2 = makeSupabase({
      messageUpdate: { data: { sid: "SM1", outreach_attempt_id: 1, campaign_id: 42 }, error: null },
      attemptSelect: { data: { disposition: null }, error: null },
      outreachUpdate: { data: { id: 1, campaign: { end_date: past } }, error: null },
    });
    mocks.createClient.mockReturnValueOnce(supabase2);
    mocks.validateTwilioWebhook.mockResolvedValueOnce({ params: { SmsSid: "SM1", SmsStatus: "delivered" } });
    mocks.shouldUpdateOutreachDisposition.mockReturnValueOnce(true);
    const r2 = await mod.action({
      request: makeSmsStatusRequest({ SmsSid: "SM1", SmsStatus: "delivered" }),
    } as any);
    expect(r2.status).toBe(200);
    expect(mocks.cancelQueuedMessagesForCampaign).toHaveBeenCalledWith(
      expect.anything(),
      supabase2,
      42,
    );
  });

  test("does not cancel queued messages when campaign end_date is in the future", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const supabase = makeSupabase({
      messageUpdate: { data: { sid: "SM1", outreach_attempt_id: 1 }, error: null },
      attemptSelect: { data: { disposition: null }, error: null },
      outreachUpdate: { data: { id: 1, campaign: { end_date: future } }, error: null },
    });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.validateTwilioWebhook.mockResolvedValueOnce({ params: { SmsSid: "SM1", SmsStatus: "delivered" } });
    mocks.shouldUpdateOutreachDisposition.mockReturnValueOnce(true);

    const mod = await import("../app/routes/api.sms.status");
    const res = await mod.action({
      request: makeSmsStatusRequest({ SmsSid: "SM1", SmsStatus: "delivered" }),
    } as any);
    expect(res.status).toBe(200);
    expect(mocks.cancelQueuedMessagesForCampaign).not.toHaveBeenCalled();
  });

  test("does not cancel campaign messages when message campaign_id is missing", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const supabase = makeSupabase({
      messageUpdate: { data: { sid: "SM1", outreach_attempt_id: 1 }, error: null },
      attemptSelect: { data: { disposition: null }, error: null },
      outreachUpdate: { data: { id: 1, campaign: { end_date: past } }, error: null },
    });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.validateTwilioWebhook.mockResolvedValueOnce({
      params: { SmsSid: "SM1", SmsStatus: "delivered" },
    });
    mocks.shouldUpdateOutreachDisposition.mockReturnValueOnce(true);

    const mod = await import("../app/routes/api.sms.status");
    const res = await mod.action({
      request: makeSmsStatusRequest({ SmsSid: "SM1", SmsStatus: "delivered" }),
    } as any);
    expect(res.status).toBe(200);
    expect(mocks.cancelQueuedMessagesForCampaign).not.toHaveBeenCalled();
  });

  test("webhook fetch: logs error on webhook_error; throws on non-ok response to outer catch", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500, statusText: "NO" }));
    vi.stubGlobal("fetch", fetchMock as any);

    const supabase = makeSupabase({
      messageUpdate: { data: { sid: "SM1", workspace: "w1", from: "a", to: "b", body: "c", num_media: 0, status: "sent", date_updated: "" }, error: null },
      webhookSelect: { data: [{ destination_url: "http://hook", custom_headers: { X: 1 } }], error: null },
    });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.validateTwilioWebhook.mockResolvedValueOnce({ params: { SmsSid: "SM1", SmsStatus: "sent" } });

    const mod = await import("../app/routes/api.sms.status");
    const res = await mod.action({
      request: makeSmsStatusRequest({ SmsSid: "SM1", SmsStatus: "sent" }),
    } as any);
    expect(res.status).toBe(500);

    // webhook_error path
    const supabase2 = makeSupabase({
      messageUpdate: { data: { sid: "SM1", workspace: "w1" }, error: null },
      webhookSelect: { data: null, error: { message: "wh" } },
    });
    mocks.createClient.mockReturnValueOnce(supabase2);
    mocks.validateTwilioWebhook.mockResolvedValueOnce({ params: { SmsSid: "SM1", SmsStatus: "sent" } });
    const r2 = await mod.action({
      request: makeSmsStatusRequest({ SmsSid: "SM1", SmsStatus: "sent" }),
    } as any);
    expect(r2.status).toBe(200);
    expect(mocks.logger.error).toHaveBeenCalledWith("Error fetching webhook:", { message: "wh" });
  });

  test("webhook skips when destination_url missing and succeeds when ok", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, statusText: "OK" }));
    vi.stubGlobal("fetch", fetchMock as any);

    const supabase = makeSupabase({
      messageUpdate: { data: { sid: "SM1", workspace: "w1", from: "a", to: "b", body: "c", num_media: 0, status: "sent", date_updated: "" }, error: null },
      webhookSelect: { data: [{ destination_url: null, custom_headers: "nope" }], error: null },
    });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.validateTwilioWebhook.mockResolvedValueOnce({ params: { SmsSid: "SM1", SmsStatus: "sent" } });
    const mod = await import("../app/routes/api.sms.status");
    const r1 = await mod.action({
      request: makeSmsStatusRequest({ SmsSid: "SM1", SmsStatus: "sent" }),
    } as any);
    expect(r1.status).toBe(200);

    const supabase2 = makeSupabase({
      messageUpdate: { data: { sid: "SM1", workspace: "w1", from: "a", to: "b", body: "c", num_media: 0, status: "sent", date_updated: "" }, error: null },
      webhookSelect: { data: [{ destination_url: "http://hook", custom_headers: { A: "1" } }], error: null },
    });
    mocks.createClient.mockReturnValueOnce(supabase2);
    mocks.validateTwilioWebhook.mockResolvedValueOnce({ params: { SmsSid: "SM1", SmsStatus: "sent" } });
    const r2 = await mod.action({
      request: makeSmsStatusRequest({ SmsSid: "SM1", SmsStatus: "sent" }),
    } as any);
    expect(r2.status).toBe(200);
  });

  test("webhook sends without custom headers when custom_headers not object", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, statusText: "OK" }));
    vi.stubGlobal("fetch", fetchMock as any);

    const supabase = makeSupabase({
      messageUpdate: { data: { sid: "SM1", workspace: "w1", from: "a", to: "b", body: "c", num_media: 0, status: "sent", date_updated: "" }, error: null },
      webhookSelect: { data: [{ destination_url: "http://hook", custom_headers: "nope" }], error: null },
    });
    mocks.createClient.mockReturnValueOnce(supabase);
    mocks.validateTwilioWebhook.mockResolvedValueOnce({ params: { SmsSid: "SM1", SmsStatus: "sent" } });

    const mod = await import("../app/routes/api.sms.status");
    const res = await mod.action({
      request: makeSmsStatusRequest({ SmsSid: "SM1", SmsStatus: "sent" }),
    } as any);
    expect(res.status).toBe(200);
  });
});

