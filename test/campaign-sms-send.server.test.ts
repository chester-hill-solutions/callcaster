import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  messagesCreate: vi.fn(),
  dequeueQueueEntry: vi.fn(async () => undefined),
  persistMessageRecord: vi.fn(async () => ({ data: [{ id: 1 }], error: null as { message: string } | null })),
  updateOutreachAttemptForWorkspace: vi.fn(async () => ({ campaign_id: 1 })),
  rpcCreateOutreachAttempt: vi.fn(async () => 7),
  notifyOps: vi.fn(async () => ({ ok: true })),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  createWorkspaceTwilioInstance: vi.fn(async () => ({
    messages: { create: (...args: unknown[]) => mocks.messagesCreate(...args) },
  })),
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
  };
}

describe("sendSingleCampaignSms persist failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.messagesCreate.mockResolvedValue({ sid: "SM_sent", status: "queued", to: "+15555550100", from: "+15555550101", body: "hello", numSegments: "1", dateCreated: new Date() });
    mocks.persistMessageRecord.mockResolvedValue({ data: [{ id: 1 }], error: null });
  });

  test("a failed message-row write alerts ops, logs at error, and still dequeues", async () => {
    mocks.persistMessageRecord.mockResolvedValueOnce({ data: null, error: { message: "connection reset" } });

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

  test("a successful write does not alert", async () => {
    const result = await sendSingleCampaignSms(params());

    expect(result.persisted).toBe(true);
    expect(mocks.notifyOps).not.toHaveBeenCalled();
    expect(mocks.logger.error).not.toHaveBeenCalled();
  });
});
