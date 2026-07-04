import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

// Avoid env validation noise when importing server modules in tests.
vi.mock("@/lib/env.server", () => {
  const handler = { get: () => () => "test" };
  return { env: new Proxy({}, handler) };
});

const mocks = vi.hoisted(() => ({
  validateTwilioWebhookForMessageSid: vi.fn(),
  findMessageBySid: vi.fn(),
  updateMessageBySid: vi.fn(),
  insertTransactionHistoryIdempotent: vi.fn(),
  findOutreachAttemptById: vi.fn(),
  updateOutreachAttemptForWorkspace: vi.fn(),
  sendWorkspaceWebhookNotification: vi.fn(),
  createWorkspaceTwilioInstance: vi.fn(),
  cancelQueuedMessagesForCampaign: vi.fn(),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const tenantDbMocks = vi.hoisted(() => ({
  campaignFindFirst: vi.fn(),
}));

vi.mock("@/lib/twilio-webhook.server", () => ({
  validateTwilioWebhookForMessageSid: (...args: any[]) =>
    mocks.validateTwilioWebhookForMessageSid(...args),
}));
vi.mock("@/lib/message-db.server", () => ({
  findMessageBySid: (...args: any[]) => mocks.findMessageBySid(...args),
  updateMessageBySid: (...args: any[]) => mocks.updateMessageBySid(...args),
}));
vi.mock("@/lib/transaction-history.server", () => ({
  insertTransactionHistoryIdempotent: (...args: any[]) =>
    mocks.insertTransactionHistoryIdempotent(...args),
}));
vi.mock("@/lib/telephony-db.server", () => ({
  findOutreachAttemptById: (...args: any[]) => mocks.findOutreachAttemptById(...args),
  updateOutreachAttemptForWorkspace: (...args: any[]) =>
    mocks.updateOutreachAttemptForWorkspace(...args),
}));
vi.mock("@/lib/workspace-webhooks.server", () => ({
  sendWorkspaceWebhookNotification: (...args: any[]) =>
    mocks.sendWorkspaceWebhookNotification(...args),
}));
vi.mock("@/lib/database.server", () => ({
  createWorkspaceTwilioInstance: (...args: any[]) => mocks.createWorkspaceTwilioInstance(...args),
  cancelQueuedMessagesForCampaign: (...args: any[]) =>
    mocks.cancelQueuedMessagesForCampaign(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/sms-status", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return { ...actual };
});
vi.mock("@/lib/outreach-disposition", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return { ...actual };
});
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: () => ({
    campaign: {
      findFirst: (...args: any[]) => tenantDbMocks.campaignFindFirst(...args),
    },
  }),
}));

function makeRequest(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new Request("http://localhost/api/sms/status", {
    method: "POST",
    headers: { "x-twilio-signature": "good" },
    body: fd,
  });
}

function makeMessage(overrides?: any) {
  return {
    sid: "SM123",
    workspace: "w1",
    outreach_attempt_id: 7,
    from: "+15555550100",
    to: "+15555550101",
    body: "hello",
    num_media: 0,
    num_segments: 1,
    status: "sent",
    direction: "outbound-api",
    campaign_id: 1,
    date_updated: new Date().toISOString(),
    ...overrides,
  };
}

describe("api.sms.status webhook behavior", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.validateTwilioWebhookForMessageSid.mockReset();
    mocks.findMessageBySid.mockReset();
    mocks.updateMessageBySid.mockReset();
    mocks.insertTransactionHistoryIdempotent.mockReset();
    mocks.findOutreachAttemptById.mockReset();
    mocks.updateOutreachAttemptForWorkspace.mockReset();
    mocks.sendWorkspaceWebhookNotification.mockReset();
    mocks.createWorkspaceTwilioInstance.mockReset();
    mocks.cancelQueuedMessagesForCampaign.mockReset();
    mocks.logger.error.mockReset();
    mocks.logger.warn.mockReset();
    tenantDbMocks.campaignFindFirst.mockReset();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));

    mocks.validateTwilioWebhookForMessageSid.mockImplementation(async (args: { params: Record<string, string> }) => ({
      ok: true,
      params: args.params,
      authToken: "token",
    }));
    mocks.findMessageBySid.mockResolvedValue(makeMessage());
    mocks.updateMessageBySid.mockImplementation((_ws, _sid, patch) => {
      const message = makeMessage(patch);
      return Promise.resolve(message);
    });
    mocks.insertTransactionHistoryIdempotent.mockResolvedValue(undefined);
    mocks.findOutreachAttemptById.mockResolvedValue({ id: 7, disposition: "sent" });
    mocks.updateOutreachAttemptForWorkspace.mockResolvedValue({
      id: 7,
      disposition: "delivered",
      campaign_id: 1,
    });
    tenantDbMocks.campaignFindFirst.mockResolvedValue(null);
    mocks.sendWorkspaceWebhookNotification.mockResolvedValue({ success: true });
  });

  test("rejects invalid Twilio signature", async () => {
    mocks.validateTwilioWebhookForMessageSid.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ error: "Invalid Twilio signature" }), { status: 403 }),
    });
    const mod = await import("../app/routes/api+/sms/status.route");
    const res = await asRouteResponse(
      await mod.action({ request: makeRequest({ SmsSid: "SM_BAD", SmsStatus: "delivered" }) } as any),
    );
    expect(res.status).toBe(403);
  }, 15000);

  test("normalizes unknown SmsStatus to failed", async () => {
    const mod = await import("../app/routes/api+/sms/status.route");
    const res = await asRouteResponse(
      await mod.action({ request: makeRequest({ SmsSid: "SM123", SmsStatus: "not-a-real-status" }) } as any),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message.status).toBe("failed");
    expect(mocks.updateMessageBySid).toHaveBeenCalledWith(
      "w1",
      "SM123",
      expect.objectContaining({ status: "failed" }),
    );
  });

  test("does not overwrite terminal outreach disposition", async () => {
    mocks.findOutreachAttemptById.mockResolvedValueOnce({ id: 7, disposition: "delivered" });
    const mod = await import("../app/routes/api+/sms/status.route");
    const res = await asRouteResponse(
      await mod.action({ request: makeRequest({ SmsSid: "SM123", SmsStatus: "failed" }) } as any),
    );
    expect(res.status).toBe(200);
    expect(mocks.updateOutreachAttemptForWorkspace).not.toHaveBeenCalled();
  });

  test("accepts MessageStatus when SmsStatus is absent", async () => {
    const mod = await import("../app/routes/api+/sms/status.route");
    const res = await asRouteResponse(
      await mod.action({ request: makeRequest({ SmsSid: "SM123", MessageStatus: "delivered" }) } as any),
    );
    expect(res.status).toBe(200);
    expect(mocks.updateMessageBySid).toHaveBeenCalledWith(
      "w1",
      "SM123",
      expect.objectContaining({ status: "delivered" }),
    );
  });

  test("bills only once for duplicate deliveries (same SmsSid)", async () => {
    const mod = await import("../app/routes/api+/sms/status.route");
    const makeReq = () => makeRequest({ SmsSid: "SM_DUP", SmsStatus: "delivered" });
    await mod.action({ request: makeReq() } as any);
    await mod.action({ request: makeReq() } as any);

    expect(mocks.insertTransactionHistoryIdempotent).toHaveBeenCalledTimes(2);
    const keys = mocks.insertTransactionHistoryIdempotent.mock.calls.map(
      (call) => call[0].idempotencyKey,
    );
    expect(keys).toEqual(["sms:SM_DUP", "sms:SM_DUP"]);
  });
});
