import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  requireTwilioSignature: vi.fn(),
  findMessageBySid: vi.fn(),
  updateMessageBySid: vi.fn(),
  findOutreachAttemptById: vi.fn(),
  updateOutreachAttemptForWorkspace: vi.fn(),
  sendWorkspaceWebhookNotification: vi.fn(async () => ({ success: true })),
  createTenantDb: vi.fn(() => ({
    campaign: { findFirst: vi.fn(async () => null) },
  })),
  insertTransactionHistoryIdempotent: vi.fn(),
  cancelQueuedMessagesForCampaign: vi.fn(),
  createWorkspaceTwilioInstance: vi.fn(async () => ({})),
  shouldUpdateOutreachDisposition: vi.fn(),
  logger: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const twilioCtor = vi.fn(function (this: unknown) {
  return {};
});

vi.mock("twilio", () => ({ default: { Twilio: twilioCtor } }));
vi.mock("@/lib/twilio-webhook.server", () => ({
  requireTwilioSignature: (...args: unknown[]) =>
    mocks.requireTwilioSignature(...args),
}));
vi.mock("@/lib/message-db.server", () => ({
  findMessageBySid: (...args: unknown[]) => mocks.findMessageBySid(...args),
  updateMessageBySid: (...args: unknown[]) => mocks.updateMessageBySid(...args),
}));
vi.mock("@/lib/telephony-db.server", () => ({
  findOutreachAttemptById: (...args: unknown[]) =>
    mocks.findOutreachAttemptById(...args),
  updateOutreachAttemptForWorkspace: (...args: unknown[]) =>
    mocks.updateOutreachAttemptForWorkspace(...args),
}));
vi.mock("@/lib/workspace-webhooks.server", () => ({
  sendWorkspaceWebhookNotification: (...args: unknown[]) =>
    mocks.sendWorkspaceWebhookNotification(...args),
}));
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: (...args: unknown[]) => mocks.createTenantDb(...args),
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
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
const markContactLineTypeMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/twilio-lookup.server", () => ({
  markContactLineType: (...args: unknown[]) => markContactLineTypeMock(...args),
}));

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
    mocks.requireTwilioSignature.mockReset();
    mocks.requireTwilioSignature.mockImplementation(async (args: {
      params?: Record<string, string>;
    }) => (null));
    mocks.findMessageBySid.mockReset();
    mocks.updateMessageBySid.mockReset();
    mocks.findOutreachAttemptById.mockReset();
    mocks.updateOutreachAttemptForWorkspace.mockReset();
    mocks.sendWorkspaceWebhookNotification.mockReset();
    mocks.sendWorkspaceWebhookNotification.mockResolvedValue({ success: true });
    mocks.insertTransactionHistoryIdempotent.mockReset();
    mocks.cancelQueuedMessagesForCampaign.mockReset();
    mocks.createWorkspaceTwilioInstance.mockReset();
    mocks.createWorkspaceTwilioInstance.mockResolvedValue({});
    mocks.shouldUpdateOutreachDisposition.mockReset();
    mocks.logger.error.mockReset();
  });

  test("returns 403 when webhook validation fails", async () => {
    mocks.requireTwilioSignature.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Invalid Twilio signature" }), {
        status: 403,
      }));

    const mod = await import("../app/routes/api+/sms/status.route");
    const res = await asRouteResponse(
      await mod.action({
        request: makeSmsStatusRequest({ SmsSid: "SM1", SmsStatus: "sent" }),
      } as never),
    );
    expect(res.status).toBe(403);
  });

  test("stamps contact as landline on Twilio error 30006", async () => {
    mocks.findMessageBySid.mockResolvedValueOnce({
      workspace: "w1",
      direction: "outbound-api",
      sid: "SM1",
      outreach_attempt_id: null,
      campaign_id: null,
    });
    mocks.updateMessageBySid.mockResolvedValueOnce({
      sid: "SM1",
      workspace: "w1",
      status: "undelivered",
      contact_id: 42,
      outreach_attempt_id: null,
      campaign_id: null,
    });
    mocks.requireTwilioSignature.mockResolvedValueOnce(null);

    const formData = new FormData();
    formData.set("SmsSid", "SM1");
    formData.set("SmsStatus", "undelivered");
    formData.set("ErrorCode", "30006");

    const mod = await import("../app/routes/api+/sms/status.route");
    const res = await asRouteResponse(
      await mod.action({
        request: new Request("http://x", { method: "POST", body: formData }),
      } as never),
    );
    expect(res.status).toBe(200);
    expect(markContactLineTypeMock).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "w1", contactId: 42, lineType: "landline" }),
    );
    // error_code persisted alongside status
    expect(mocks.updateMessageBySid).toHaveBeenCalledWith(
      "w1",
      "SM1",
      expect.objectContaining({ error_code: 30006 }),
    );
  });

  test("does not stamp line type for other error codes", async () => {
    mocks.findMessageBySid.mockResolvedValueOnce({
      workspace: "w1",
      direction: "outbound-api",
      sid: "SM2",
      outreach_attempt_id: null,
      campaign_id: null,
    });
    mocks.updateMessageBySid.mockResolvedValueOnce({
      sid: "SM2",
      workspace: "w1",
      status: "failed",
      contact_id: 42,
      outreach_attempt_id: null,
      campaign_id: null,
    });
    mocks.requireTwilioSignature.mockResolvedValueOnce(null);

    const formData = new FormData();
    formData.set("SmsSid", "SM2");
    formData.set("SmsStatus", "failed");
    formData.set("ErrorCode", "30007");

    const mod = await import("../app/routes/api+/sms/status.route");
    const res = await asRouteResponse(
      await mod.action({
        request: new Request("http://x", { method: "POST", body: formData }),
      } as never),
    );
    expect(res.status).toBe(200);
    expect(markContactLineTypeMock).not.toHaveBeenCalled();
  });

  test("returns 400 when SmsSid or status missing", async () => {
    const mod = await import("../app/routes/api+/sms/status.route");
    const res = await asRouteResponse(
      await mod.action({
        request: makeSmsStatusRequest({ SmsSid: "SM1" }),
      } as never),
    );
    expect(res.status).toBe(400);
  });

  test("accepts MessageStatus when SmsStatus is absent", async () => {
    mocks.findMessageBySid.mockResolvedValueOnce({
      workspace: "w1",
      direction: "outbound-api",
      sid: "SM1",
      outreach_attempt_id: null,
      campaign_id: null,
    });
    mocks.updateMessageBySid.mockResolvedValueOnce({
      sid: "SM1",
      workspace: "w1",
      status: "delivered",
      outreach_attempt_id: null,
      campaign_id: null,
    });

    mocks.requireTwilioSignature.mockResolvedValueOnce(null);

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
    mocks.findMessageBySid.mockResolvedValueOnce(null);
    mocks.requireTwilioSignature.mockResolvedValueOnce(null);

    const mod = await import("../app/routes/api+/sms/status.route");
    const res = await asRouteResponse(
      await mod.action({
        request: makeSmsStatusRequest({ SmsSid: "SM1", SmsStatus: "sent" }),
      } as never),
    );
    expect(res.status).toBe(500);
  });

  test("bills MMS flat at MMS_CREDITS when the message has media", async () => {
    mocks.findMessageBySid.mockResolvedValueOnce({
      workspace: "w1",
      direction: "outbound-api",
      sid: "SM1",
      outreach_attempt_id: null,
      campaign_id: null,
    });
    mocks.updateMessageBySid.mockResolvedValueOnce({
      sid: "SM1",
      workspace: "w1",
      status: "delivered",
      num_media: "1",
      num_segments: "3",
      outreach_attempt_id: null,
      campaign_id: null,
    });

    const mod = await import("../app/routes/api+/sms/status.route");
    const res = await asRouteResponse(
      await mod.action({
        request: makeSmsStatusRequest({ SmsSid: "SM1", SmsStatus: "delivered" }),
      } as never),
    );
    expect(res.status).toBe(200);
    expect(mocks.insertTransactionHistoryIdempotent).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: -2,
        note: expect.stringContaining("MMS SM1 delivered"),
      }),
    );
  });

  test("bills SMS per-segment at SMS_SEGMENT_CREDITS when the message has no media", async () => {
    mocks.findMessageBySid.mockResolvedValueOnce({
      workspace: "w1",
      direction: "outbound-api",
      sid: "SM2",
      outreach_attempt_id: null,
      campaign_id: null,
    });
    mocks.updateMessageBySid.mockResolvedValueOnce({
      sid: "SM2",
      workspace: "w1",
      status: "delivered",
      num_media: "0",
      num_segments: "3",
      outreach_attempt_id: null,
      campaign_id: null,
    });

    const mod = await import("../app/routes/api+/sms/status.route");
    const res = await asRouteResponse(
      await mod.action({
        request: makeSmsStatusRequest({ SmsSid: "SM2", SmsStatus: "delivered" }),
      } as never),
    );
    expect(res.status).toBe(200);
    expect(mocks.insertTransactionHistoryIdempotent).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: -3,
        note: expect.stringContaining("SMS SM2 delivered (3 segments)"),
      }),
    );
  });

  test("returns 200 without updating DB when message is inbound", async () => {
    mocks.findMessageBySid.mockResolvedValueOnce({
      sid: "SM1",
      workspace: "w1",
      direction: "inbound",
      status: "received",
    });
    mocks.requireTwilioSignature.mockResolvedValueOnce(null);

    const mod = await import("../app/routes/api+/sms/status.route");
    const res = await asRouteResponse(
      await mod.action({
        request: makeSmsStatusRequest({ SmsSid: "SM1", SmsStatus: "sent" }),
      } as never),
    );
    expect(res.status).toBe(200);
    expect(mocks.updateMessageBySid).not.toHaveBeenCalled();
  });
});
