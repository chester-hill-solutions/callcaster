import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { makePortalConfig } from "./fixtures/workspace-twilio-portal-config";

const mocks = vi.hoisted(() => ({
  createWorkspaceTwilioInstance: vi.fn(),
  getWorkspaceTwilioPortalConfig: vi.fn(),
  assertWorkspaceCanSendSms: vi.fn(async () => undefined),
  sendWorkspaceWebhookNotification: vi.fn(async () => ({ success: true })),
  sendSmsAndPersist: vi.fn(),
  updateMessageBySid: vi.fn(async () => ({ sid: "SM1", status: "canceled" })),
  logger: { error: vi.fn() },
  env: { BASE_URL: () => "https://app.example" },
}));

vi.mock("@/lib/database/workspace.server", () => ({
  createWorkspaceTwilioInstance: (...args: unknown[]) =>
    mocks.createWorkspaceTwilioInstance(...args),
  getWorkspaceTwilioPortalConfig: (...args: unknown[]) =>
    mocks.getWorkspaceTwilioPortalConfig(...args),
}));
vi.mock("@/lib/twilio-readiness.server", () => ({
  assertWorkspaceCanSendSms: (...args: unknown[]) =>
    mocks.assertWorkspaceCanSendSms(...args),
}));
vi.mock("@/lib/workspace-webhooks.server", () => ({
  sendWorkspaceWebhookNotification: (...args: unknown[]) =>
    mocks.sendWorkspaceWebhookNotification(...args),
}));
vi.mock("@/lib/sms-send.server", () => ({
  sendSmsAndPersist: (...args: unknown[]) => mocks.sendSmsAndPersist(...args),
}));
vi.mock("@/lib/message-db.server", () => ({
  updateMessageBySid: (...args: unknown[]) => mocks.updateMessageBySid(...args),
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

const basePortal = makePortalConfig();
const now = new Date("2026-07-09T12:00:00.000Z");

describe("app/lib/chat-sms.server.ts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mocks.createWorkspaceTwilioInstance.mockReset();
    mocks.getWorkspaceTwilioPortalConfig.mockReset();
    mocks.assertWorkspaceCanSendSms.mockReset();
    mocks.assertWorkspaceCanSendSms.mockResolvedValue(undefined);
    mocks.sendWorkspaceWebhookNotification.mockReset();
    mocks.sendWorkspaceWebhookNotification.mockResolvedValue({ success: true });
    mocks.sendSmsAndPersist.mockReset();
    mocks.updateMessageBySid.mockReset();
    mocks.updateMessageBySid.mockResolvedValue({ sid: "SM1", status: "canceled" });
    mocks.logger.error.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("rejects scheduling when no Messaging Service is resolvable", async () => {
    const { sendMessage } = await import("../app/lib/chat-sms.server");
    await expect(
      sendMessage({
        body: "hi",
        to: "+15551234567",
        from: "+15550000000",
        media: "",
        workspace: "w1",
        contact_id: "",
        user: null,
        portalConfig: { ...basePortal, sendMode: "from_number", messagingServiceSid: null },
        sendAt: "2026-07-09T13:00:00.000Z",
      }),
    ).rejects.toThrow(/Scheduling requires a Messaging Service/);
    expect(mocks.sendSmsAndPersist).not.toHaveBeenCalled();
  });

  test("rejects a sendAt less than 15 minutes out even with a Messaging Service", async () => {
    const { sendMessage } = await import("../app/lib/chat-sms.server");
    await expect(
      sendMessage({
        body: "hi",
        to: "+15551234567",
        from: "",
        media: "",
        workspace: "w1",
        contact_id: "",
        user: null,
        portalConfig: {
          ...basePortal,
          sendMode: "messaging_service",
          messagingServiceSid: "MG123",
        },
        sendAt: "2026-07-09T12:05:00.000Z",
      }),
    ).rejects.toThrow(/at least 15 minutes/);
    expect(mocks.sendSmsAndPersist).not.toHaveBeenCalled();
  });

  test("schedules a fixed send with a Messaging Service and stamps scheduled_at for persistence", async () => {
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      messages: { create: vi.fn() },
    });
    mocks.sendSmsAndPersist.mockResolvedValueOnce({
      message: { sid: "SM1", status: "scheduled" },
      result: { data: [{ sid: "SM1" }], error: null },
    });

    const { sendMessage } = await import("../app/lib/chat-sms.server");
    const sendAt = "2026-07-09T13:00:00.000Z";
    const res = await sendMessage({
      body: "hi",
      to: "+15551234567",
      from: "",
      media: "",
      workspace: "w1",
      contact_id: "",
      user: null,
      portalConfig: {
        ...basePortal,
        sendMode: "messaging_service",
        messagingServiceSid: "MG123",
      },
      sendAt,
    });

    expect(res.message).toEqual({ sid: "SM1", status: "scheduled" });
    expect(mocks.sendSmsAndPersist).toHaveBeenCalledWith(
      expect.objectContaining({
        createParams: expect.objectContaining({
          scheduleType: "fixed",
          sendAt: new Date(sendAt),
          messagingServiceSid: "MG123",
        }),
        persistExtras: expect.objectContaining({
          scheduled_at: sendAt,
        }),
      }),
    );
  });

  test("sends immediately (no schedule params) when sendAt is not provided", async () => {
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      messages: { create: vi.fn() },
    });
    mocks.sendSmsAndPersist.mockResolvedValueOnce({
      message: { sid: "SM2", status: "queued" },
      result: { data: [{ sid: "SM2" }], error: null },
    });

    const { sendMessage } = await import("../app/lib/chat-sms.server");
    await sendMessage({
      body: "hi",
      to: "+15551234567",
      from: "+15550000000",
      media: "",
      workspace: "w1",
      contact_id: "",
      user: null,
      portalConfig: { ...basePortal, sendMode: "from_number", messagingServiceSid: null },
    });

    expect(mocks.sendSmsAndPersist).toHaveBeenCalledWith(
      expect.objectContaining({
        createParams: expect.not.objectContaining({ scheduleType: expect.anything() }),
        persistExtras: expect.not.objectContaining({ scheduled_at: expect.anything() }),
      }),
    );
  });

  test("cancelScheduledMessage cancels via Twilio and marks the row canceled", async () => {
    const update = vi.fn(async () => ({ sid: "SM1", status: "canceled" }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      messages: (sid: string) => {
        expect(sid).toBe("SM1");
        return { update };
      },
    });

    const { cancelScheduledMessage } = await import("../app/lib/chat-sms.server");
    const res = await cancelScheduledMessage({ sid: "SM1", workspace: "w1" });

    expect(update).toHaveBeenCalledWith({ status: "canceled" });
    expect(mocks.updateMessageBySid).toHaveBeenCalledWith("w1", "SM1", {
      status: "canceled",
    });
    expect(res.message).toEqual({ sid: "SM1", status: "canceled" });
  });

  test("cancelScheduledMessage surfaces a clear error when Twilio rejects the cancellation", async () => {
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      messages: () => ({
        update: vi.fn(async () => {
          throw new Error("Message cannot be canceled");
        }),
      }),
    });

    const { cancelScheduledMessage } = await import("../app/lib/chat-sms.server");
    await expect(
      cancelScheduledMessage({ sid: "SM1", workspace: "w1" }),
    ).rejects.toThrow();
    expect(mocks.updateMessageBySid).not.toHaveBeenCalled();
  });
});
