import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  messagesCreate: vi.fn(),
  dequeueQueueEntry: vi.fn(async () => undefined),
  persistMessageRecord: vi.fn(async () => ({ data: [{ id: 1 }], error: null as { message: string } | null })),
  isDispatchAllowedAt: vi.fn(() => true),
  updateOutreachAttemptForWorkspace: vi.fn(async () => ({ campaign_id: 1 })),
  rpcCreateOutreachAttempt: vi.fn(async () => 7),
  resolveMessageByClientRef: vi.fn(async () => ({ id: 1 })),
  deleteMessageByClientRef: vi.fn(async () => undefined),
  notifyOps: vi.fn(async () => ({ ok: true })),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  createWorkspaceTwilioInstance: vi.fn(async () => ({
    messages: { create: (...args: unknown[]) => mocks.messagesCreate(...args) },
  })),
}));
vi.mock("@/lib/message-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/message-db.server")>()),
  resolveMessageByClientRef: (...args: unknown[]) => mocks.resolveMessageByClientRef(...args),
  deleteMessageByClientRef: (...args: unknown[]) => mocks.deleteMessageByClientRef(...args),
}));
vi.mock("@/lib/campaign-queue-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/campaign-queue-db.server")>()),
  dequeueQueueEntry: (...args: unknown[]) => mocks.dequeueQueueEntry(...args),
}));
vi.mock("@/lib/sms-send.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sms-send.server")>()),
  persistMessageRecord: (...args: unknown[]) => mocks.persistMessageRecord(...args),
}));
vi.mock("@/lib/telephony-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telephony-db.server")>()),
  updateOutreachAttemptForWorkspace: (...args: unknown[]) =>
    mocks.updateOutreachAttemptForWorkspace(...args),
}));
vi.mock("@/lib/db-rpc.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db-rpc.server")>()),
  rpcCreateOutreachAttempt: (...args: unknown[]) => mocks.rpcCreateOutreachAttempt(...args),
}));
vi.mock("@/lib/campaign-dispatch-policy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/campaign-dispatch-policy")>()),
  isDispatchAllowedAt: (...args: unknown[]) => mocks.isDispatchAllowedAt(...args),
}));
vi.mock("@/lib/twilio-readiness.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/twilio-readiness.server")>()),
  assertWorkspaceCanSendSms: vi.fn(async () => undefined),
}));
vi.mock("@/lib/ops-alert.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ops-alert.server")>()),
  notifyOps: (...args: unknown[]) => mocks.notifyOps(...args),
}));
vi.mock("@/lib/logger.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logger.server")>()),
  logger: mocks.logger,
}));
vi.mock("@/server/tenant-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/tenant-db")>()),
  createTenantDb: vi.fn(() => ({})),
}));

import { sendSingleCampaignSms } from "../app/lib/campaign-sms-send.server";
import { smsSendPolicy } from "@/lib/campaign-dispatch-policy";
import { makePortalConfig } from "./fixtures/workspace-twilio-portal-config";

function params() {
  return {
    body: "hello",
    to: "+15555550100",
    from: "+15555550101",
    media: [],
    campaign_id: "42",
    workspace: "ws_1",
    contact_id: 9,
    queue_id: 77,
    user_id: "u1",
    portalConfig: makePortalConfig(),
    messageIntent: null,
    messagingServiceSidFromRequest: null,
    sendPolicy: smsSendPolicy(null),
  };
}

describe("sendSingleCampaignSms intent row (#1582)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDispatchAllowedAt.mockReset().mockReturnValue(true);
    mocks.messagesCreate.mockResolvedValue({ sid: "SM_sent", status: "queued", to: "+15555550100", from: "+15555550101", body: "hello", numSegments: "1", dateCreated: new Date() });
    mocks.persistMessageRecord.mockResolvedValue({ data: [{ id: 1 }], error: null });
    mocks.resolveMessageByClientRef.mockResolvedValue({ id: 1, sid: "SM_sent" });
  });

  test("writes a pending intent row before calling Twilio, then resolves it with the real SID", async () => {
    const result = await sendSingleCampaignSms(params());

    expect(result.persisted).toBe(true);
    expect(mocks.persistMessageRecord).toHaveBeenCalledTimes(1);
    const [workspace, fields] = mocks.persistMessageRecord.mock.calls[0] as [string, Record<string, unknown>];
    expect(workspace).toBe("ws_1");
    expect(String(fields.sid)).toMatch(/^pending:/);
    expect(fields.status).toBe("queued");
    expect(fields.client_ref).toBe(String(fields.sid).slice("pending:".length));
    expect(fields).toMatchObject({ campaign_id: "42", contact_id: 9, to: "+15555550100", from: "+15555550101", body: "hello" });
    // Intent first, provider second.
    expect(mocks.persistMessageRecord.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.messagesCreate.mock.invocationCallOrder[0] as number,
    );
    expect(mocks.resolveMessageByClientRef).toHaveBeenCalledWith(
      "ws_1",
      fields.client_ref,
      expect.objectContaining({ sid: "SM_sent" }),
    );
    expect(mocks.deleteMessageByClientRef).not.toHaveBeenCalled();
  });

  test("deletes the intent and rethrows when Twilio refuses the send", async () => {
    mocks.messagesCreate.mockRejectedValue(Object.assign(new Error("Invalid To"), { status: 400 }));

    await expect(sendSingleCampaignSms(params())).rejects.toThrow("Invalid To");

    const [, fields] = mocks.persistMessageRecord.mock.calls[0] as [string, Record<string, unknown>];
    expect(mocks.deleteMessageByClientRef).toHaveBeenCalledWith("ws_1", fields.client_ref);
    expect(mocks.resolveMessageByClientRef).not.toHaveBeenCalled();
    expect(mocks.dequeueQueueEntry).not.toHaveBeenCalled();
  });

  test("does not call Twilio when the intent row cannot be written", async () => {
    mocks.persistMessageRecord.mockResolvedValueOnce({ data: null, error: { message: "db down" } });

    await expect(sendSingleCampaignSms(params())).rejects.toThrow(/before sending/);
    expect(mocks.messagesCreate).not.toHaveBeenCalled();
  });

  test("defers and removes the intent when preparation crosses the send-window boundary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T20:59:59.900Z"));
    mocks.isDispatchAllowedAt.mockReturnValueOnce(false);
    mocks.persistMessageRecord.mockImplementationOnce(async () => {
      vi.setSystemTime(new Date("2026-09-09T21:00:00.100Z"));
      return { data: [{ id: 1 }], error: null };
    });

    const result = await sendSingleCampaignSms({
      ...params(),
      sendPolicy: smsSendPolicy({
        sms_send_window: {
          wednesday: {
            active: true,
            intervals: [{ start: "09:00", end: "21:00" }],
          },
        },
      }),
    });

    expect(result).toMatchObject({ kind: "deferred_send_window" });
    expect(mocks.messagesCreate).not.toHaveBeenCalled();
    expect(mocks.rpcCreateOutreachAttempt).not.toHaveBeenCalled();
    const [, fields] = mocks.persistMessageRecord.mock.calls[0] as [string, Record<string, unknown>];
    expect(mocks.deleteMessageByClientRef).toHaveBeenCalledWith("ws_1", fields.client_ref);
  });

  test("does not retry a provider request after the campaign window closes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T20:59:59.900Z"));
    vi.spyOn(Math, "random").mockReturnValue(0);
    mocks.isDispatchAllowedAt
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    mocks.messagesCreate.mockRejectedValueOnce(
      Object.assign(new Error("temporary provider error"), { status: 503 }),
    );
    const send = sendSingleCampaignSms({
      ...params(),
      sendPolicy: smsSendPolicy({
        sms_send_window: {
          wednesday: {
            active: true,
            intervals: [{ start: "09:00", end: "21:00" }],
          },
        },
      }),
    });

    await vi.advanceTimersByTimeAsync(200);
    const result = await send;

    expect(result).toMatchObject({ kind: "deferred_send_window" });
    expect(mocks.messagesCreate).toHaveBeenCalledTimes(1);
    expect(mocks.rpcCreateOutreachAttempt).toHaveBeenCalledTimes(1);
    const [, fields] = mocks.persistMessageRecord.mock.calls[0] as [string, Record<string, unknown>];
    expect(mocks.deleteMessageByClientRef).toHaveBeenCalledWith("ws_1", fields.client_ref);
  });

  test("does not count an outreach attempt when the final gate blocks the first provider call", async () => {
    mocks.isDispatchAllowedAt
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    const result = await sendSingleCampaignSms({
      ...params(),
      sendPolicy: smsSendPolicy({
        sms_send_window: {
          wednesday: {
            active: true,
            intervals: [{ start: "09:00", end: "21:00" }],
          },
        },
      }),
    });

    expect(result).toMatchObject({ kind: "deferred_send_window" });
    expect(mocks.messagesCreate).not.toHaveBeenCalled();
    expect(mocks.rpcCreateOutreachAttempt).not.toHaveBeenCalled();
  });
});

describe("sendSingleCampaignSms persist failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.messagesCreate.mockResolvedValue({ sid: "SM_sent", status: "queued", to: "+15555550100", from: "+15555550101", body: "hello", numSegments: "1", dateCreated: new Date() });
    mocks.persistMessageRecord.mockResolvedValue({ data: [{ id: 1 }], error: null });
    mocks.resolveMessageByClientRef.mockResolvedValue({ id: 1, sid: "SM_sent" });
  });

  test("a failed resolve after the send alerts ops, logs at error, and still dequeues", async () => {
    mocks.resolveMessageByClientRef.mockRejectedValueOnce(new Error("connection reset"));

    const result = await sendSingleCampaignSms(params());

    expect(result.persisted).toBe(false);
    expect(mocks.dequeueQueueEntry).toHaveBeenCalledWith(
      expect.objectContaining({ by: { id: 77 }, reason: "SMS message sent" }),
    );
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "campaign_sms.persist_failed",
      expect.objectContaining({ sid: "SM_sent", campaignId: "42", contactId: 9, error: "connection reset" }),
    );
    expect(mocks.notifyOps).toHaveBeenCalledWith(
      expect.objectContaining({ event: "sms.persist_failed", dedupeKey: "sms_persist_failed:42", workspaceId: "ws_1" }),
    );
  });

  test("a successful resolve does not alert", async () => {
    const result = await sendSingleCampaignSms(params());

    expect(result.persisted).toBe(true);
    expect(mocks.notifyOps).not.toHaveBeenCalled();
    expect(mocks.logger.error).not.toHaveBeenCalled();
  });
});
