import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  requireOutboundCredits: vi.fn(),
  loadCampaignSmsDispatchData: vi.fn(),
  getCampaignQueueById: vi.fn(),
  getWorkspaceTwilioPortalConfig: vi.fn(),
  dequeueQueueEntry: vi.fn(),
  recordQueueAttemptFailure: vi.fn(),
  sendSingleCampaignSms: vi.fn(),
  hasDuplicateCampaignSms: vi.fn(),
  getOrLookupLineType: vi.fn(),
  recipientCallingWindowStatus: vi.fn(),
  createSignedObjectUrl: vi.fn(),
  rpcFailExhaustedCampaignQueueContacts: vi.fn(),
}));

vi.mock("@/lib/campaign-queue-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/campaign-queue-db.server")>()),
  dequeueQueueEntry: (...args: unknown[]) => mocks.dequeueQueueEntry(...args),
  recordQueueAttemptFailure: (...args: unknown[]) => mocks.recordQueueAttemptFailure(...args),
}));
vi.mock("@/lib/sms-campaign-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sms-campaign-db.server")>()),
  loadCampaignSmsDispatchData: (...args: unknown[]) => mocks.loadCampaignSmsDispatchData(...args),
}));
vi.mock("@/lib/database/campaign.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/campaign.server")>()),
  getCampaignQueueById: (...args: unknown[]) => mocks.getCampaignQueueById(...args),
}));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  getWorkspaceTwilioPortalConfig: (...args: unknown[]) => mocks.getWorkspaceTwilioPortalConfig(...args),
}));
vi.mock("@/lib/sms-send-resolve", () => ({
  messageCampaignRequiresCallerId: vi.fn(() => false),
}));
vi.mock("@/lib/throughput-config.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/throughput-config.server")>()),
  claimBatchSizeForRate: vi.fn(() => 25),
  configuredDispatcherSmsMps: vi.fn(() => 2),
}));
vi.mock("@/lib/recipient-calling-window", () => ({
  recipientCallingWindowStatus: (...args: unknown[]) =>
    mocks.recipientCallingWindowStatus(...args),
}));
vi.mock("@/lib/twilio-lookup.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/twilio-lookup.server")>()),
  getOrLookupLineType: (...args: unknown[]) => mocks.getOrLookupLineType(...args),
  isSmsIncapableLineType: vi.fn(() => false),
}));
vi.mock("@/lib/object-storage.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/object-storage.server")>()),
  createSignedObjectUrl: (...args: unknown[]) => mocks.createSignedObjectUrl(...args),
}));
vi.mock("@/lib/outbound-credit-gate.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/outbound-credit-gate.server")>()),
  requireOutboundCredits: (...args: unknown[]) => mocks.requireOutboundCredits(...args),
}));
vi.mock("@/lib/db-rpc.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db-rpc.server")>()),
  rpcFailExhaustedCampaignQueueContacts: (...args: unknown[]) =>
    mocks.rpcFailExhaustedCampaignQueueContacts(...args),
}));
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => ({ tenant: true })),
}));
vi.mock("@/lib/campaign-sms-send.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/campaign-sms-send.server")>()),
  sendSingleCampaignSms: (...args: unknown[]) => mocks.sendSingleCampaignSms(...args),
  hasDuplicateCampaignSms: (...args: unknown[]) => mocks.hasDuplicateCampaignSms(...args),
  OPTED_OUT_SMS_DEQUEUED_REASON: "Contact opted out",
  LANDLINE_SMS_DEQUEUED_REASON: "Landline — cannot receive SMS",
  DUPLICATE_SMS_DEQUEUED_REASON: "Duplicate SMS prevented",
}));

import { dispatchCampaignSmsBatch } from "@/lib/campaign-sms-dispatch.server";

const WORKSPACE_ID = "3b6f0a52-6f5e-4b2d-9d55-000000000001";
const CAMPAIGN_ID = "42";

function queueRow(id: number, contactId: number, phone: string) {
  return {
    id,
    contact_id: contactId,
    contact: { id: contactId, phone, firstname: `Contact ${contactId}`, opt_out: false },
  };
}

describe("campaign SMS dispatch send-window boundary", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.requireOutboundCredits.mockResolvedValue({ ok: true, balance: 100 });
    mocks.loadCampaignSmsDispatchData.mockResolvedValue({
      campaign: {
        id: Number(CAMPAIGN_ID),
        sms_send_mode: null,
        sms_send_window: {
          wednesday: {
            active: true,
            intervals: [{ start: "09:00", end: "21:00" }],
          },
        },
        caller_id: "+15550000000",
      },
      body_text: "Hello {{firstname}}",
      message_media: [],
    });
    mocks.getCampaignQueueById.mockResolvedValue([
      queueRow(701, 30, "+15551110001"),
      queueRow(702, 31, "+15551110002"),
    ]);
    mocks.getWorkspaceTwilioPortalConfig.mockResolvedValue({
      parallelDispatchEnabled: true,
      smsTargetMps: 2,
    });
    mocks.dequeueQueueEntry.mockResolvedValue(undefined);
    mocks.recordQueueAttemptFailure.mockResolvedValue(undefined);
    mocks.hasDuplicateCampaignSms.mockResolvedValue(false);
    mocks.getOrLookupLineType.mockResolvedValue(null);
    mocks.recipientCallingWindowStatus.mockReturnValue({
      allowed: true,
      timezone: "America/Toronto",
      reason: "in_window",
    });
    mocks.createSignedObjectUrl.mockResolvedValue("signed");
    mocks.rpcFailExhaustedCampaignQueueContacts.mockResolvedValue(0);
    mocks.sendSingleCampaignSms.mockImplementation(async (args: { contact_id: number }) => ({
      message: { sid: `SM${args.contact_id}` },
      persisted: true,
    }));
  });

  test("stops starting sends after the campaign window closes mid-batch", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T20:59:59.750Z"));

    const dispatch = dispatchCampaignSmsBatch({
      workspaceId: WORKSPACE_ID,
      campaignId: CAMPAIGN_ID,
      userId: "3b6f0a52-6f5e-4b2d-9d55-000000000002",
    });
    await vi.advanceTimersByTimeAsync(2_000);
    const outcome = await dispatch;

    expect(mocks.sendSingleCampaignSms).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ kind: "deferred_send_window" });
    expect(mocks.dequeueQueueEntry).not.toHaveBeenCalled();
  });

  test("skips deferred queue-head rows when filling a bounded batch", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T15:00:00.000Z"));
    mocks.getCampaignQueueById.mockResolvedValue([
      queueRow(701, 30, "+15551110001"),
      queueRow(702, 31, "+15551110002"),
    ]);
    mocks.recipientCallingWindowStatus.mockImplementation((phone: string) => ({
      allowed: phone !== "+15551110001",
      timezone: "America/Toronto",
      reason: phone === "+15551110001" ? "outside_window" : "in_window",
    }));

    const outcome = await dispatchCampaignSmsBatch({
      workspaceId: WORKSPACE_ID,
      campaignId: CAMPAIGN_ID,
      userId: "3b6f0a52-6f5e-4b2d-9d55-000000000002",
      maxContacts: 1,
    });

    expect(mocks.sendSingleCampaignSms).toHaveBeenCalledTimes(1);
    expect(mocks.sendSingleCampaignSms).toHaveBeenCalledWith(
      expect.objectContaining({ contact_id: 31 }),
    );
    expect(outcome).toMatchObject({
      kind: "dispatched",
      counts: { sent: 1, deferred: 1 },
      queuedRemaining: 1,
    });
  });
});
