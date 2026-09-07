/**
 * Campaign IVR batch dispatch: gates (credits, caller-id, schedule), the
 * claim → Twilio call → call row → dequeue path, and queue accounting
 * (#1348). Per-contact mechanics mirror the /api/ivr choke point.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  requireOutboundCredits: vi.fn(),
  findCampaignInWorkspace: vi.fn(),
  getCampaignQueueById: vi.fn(),
  checkSchedule: vi.fn(),
  getWorkspaceTwilioPortalConfig: vi.fn(),
  createWorkspaceTwilioInstance: vi.fn(),
  twilioCallCreate: vi.fn(),
  withTwilioRetry: vi.fn((fn: () => unknown) => fn()),
  resolveIvrCallUrls: vi.fn(() => ({
    flowUrl: "https://base.test/api/ivr/42/page_1/",
    statusCallback: "https://base.test/api/ivr/status",
    runtime: "remix",
  })),
  rpcCreateOutreachAttempt: vi.fn(),
  insertCallForWorkspace: vi.fn(),
  hasDuplicateCampaignCall: vi.fn(async () => false),
  dequeueQueueEntry: vi.fn(),
  recordQueueAttemptFailure: vi.fn(async () => undefined),
  rpcFailExhaustedCampaignQueueContacts: vi.fn(async () => 0),
  recipientCallingWindowStatus: vi.fn(),
  createTenantDb: vi.fn(() => ({ tenant: true })),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/server/tenant-db", () => ({ createTenantDb: mocks.createTenantDb }));
vi.mock("@/lib/database/workspace.server", () => ({
  createWorkspaceTwilioInstance: mocks.createWorkspaceTwilioInstance,
  getWorkspaceTwilioPortalConfig: mocks.getWorkspaceTwilioPortalConfig,
}));
vi.mock("@/lib/database/campaign.server", () => ({
  getCampaignQueueById: mocks.getCampaignQueueById,
  checkSchedule: mocks.checkSchedule,
}));
vi.mock("@/lib/campaign-ivr.server", () => ({
  findCampaignInWorkspace: mocks.findCampaignInWorkspace,
}));
vi.mock("@/lib/campaign-queue-db.server", () => ({
  dequeueQueueEntry: mocks.dequeueQueueEntry,
  recordQueueAttemptFailure: mocks.recordQueueAttemptFailure,
}));
vi.mock("@/lib/db-rpc.server", () => ({
  rpcCreateOutreachAttempt: mocks.rpcCreateOutreachAttempt,
  rpcFailExhaustedCampaignQueueContacts: mocks.rpcFailExhaustedCampaignQueueContacts,
}));
vi.mock("@/lib/outbound-credit-gate.server", () => ({
  requireOutboundCredits: mocks.requireOutboundCredits,
}));
vi.mock("@/lib/recipient-calling-window", () => ({
  recipientCallingWindowStatus: mocks.recipientCallingWindowStatus,
}));
vi.mock("@/lib/twilio-ivr-runtime.server", () => ({
  resolveIvrCallUrls: mocks.resolveIvrCallUrls,
}));
vi.mock("@/lib/twilio-client.server", () => ({
  withTwilioRetry: mocks.withTwilioRetry,
}));
vi.mock("@/lib/telephony-db.server", () => ({
  insertCallForWorkspace: mocks.insertCallForWorkspace,
  hasDuplicateCampaignCall: (...a: unknown[]) => mocks.hasDuplicateCampaignCall(...a),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

import { dispatchCampaignIvrBatch } from "@/lib/campaign-ivr-dispatch.server";

const WORKSPACE_ID = "3b6f0a52-6f5e-4b2d-9d55-000000000001";
const USER_ID = "3b6f0a52-6f5e-4b2d-9d55-000000000002";

function queuedRow(overrides?: Record<string, unknown>) {
  return {
    id: 501,
    contact_id: 9001,
    campaign_id: 42,
    queue_state: "queued",
    contact: { id: 9001, phone: "+16135550100", opt_out: false },
    ...overrides,
  };
}

function runningCampaign(overrides?: Record<string, unknown>) {
  return {
    id: 42,
    type: "simple_ivr",
    status: "running",
    caller_id: "+16135550000",
    end_date: null,
    ...overrides,
  };
}

function defaultMocks() {
  mocks.requireOutboundCredits.mockResolvedValue({ ok: true, credits: 100 });
  mocks.findCampaignInWorkspace.mockResolvedValue(runningCampaign());
  mocks.checkSchedule.mockReturnValue(true);
  mocks.getWorkspaceTwilioPortalConfig.mockResolvedValue({
    parallelDispatchEnabled: false,
  });
  mocks.getCampaignQueueById.mockResolvedValue([queuedRow()]);
  mocks.createWorkspaceTwilioInstance.mockResolvedValue({
    calls: { create: mocks.twilioCallCreate },
  });
  mocks.twilioCallCreate.mockResolvedValue({ sid: "CAsid" });
  mocks.rpcCreateOutreachAttempt.mockResolvedValue(777);
  mocks.insertCallForWorkspace.mockResolvedValue({ id: 1 });
  mocks.hasDuplicateCampaignCall.mockResolvedValue(false);
  mocks.dequeueQueueEntry.mockResolvedValue({ dequeuedPrimary: true });
  mocks.recipientCallingWindowStatus.mockReturnValue({ allowed: true });
}

describe("dispatchCampaignIvrBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultMocks();
  });

  test("insufficient credits short-circuits before any reads", async () => {
    mocks.requireOutboundCredits.mockResolvedValue({
      ok: false,
      response: new Response("no", { status: 402 }),
    });
    const outcome = await dispatchCampaignIvrBatch({
      workspaceId: WORKSPACE_ID,
      campaignId: "42",
      userId: USER_ID,
    });
    expect(outcome).toEqual({ kind: "insufficient_credits" });
    expect(mocks.findCampaignInWorkspace).not.toHaveBeenCalled();
  });

  test("a campaign without a caller-id fails closed", async () => {
    mocks.findCampaignInWorkspace.mockResolvedValue(runningCampaign({ caller_id: null }));
    const outcome = await dispatchCampaignIvrBatch({
      workspaceId: WORKSPACE_ID,
      campaignId: "42",
      userId: USER_ID,
    });
    expect(outcome).toEqual({ kind: "caller_id_required" });
    expect(mocks.getCampaignQueueById).not.toHaveBeenCalled();
  });

  test("outside the campaign calling schedule defers the whole batch", async () => {
    mocks.checkSchedule.mockReturnValue(false);
    const outcome = await dispatchCampaignIvrBatch({
      workspaceId: WORKSPACE_ID,
      campaignId: "42",
      userId: USER_ID,
    });
    expect(outcome).toEqual({ kind: "deferred_send_window" });
    expect(mocks.createWorkspaceTwilioInstance).not.toHaveBeenCalled();
  });

  test("dials the Twilio flow URL with machine detection and dequeues on success", async () => {
    const outcome = (await dispatchCampaignIvrBatch({
      workspaceId: WORKSPACE_ID,
      campaignId: "42",
      userId: USER_ID,
    })) as Extract<typeof outcome, { kind: "dispatched" }>;

    expect(mocks.twilioCallCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "+16135550100",
        from: "+16135550000",
        url: "https://base.test/api/ivr/42/page_1/",
        machineDetection: "Enable",
        statusCallback: "https://base.test/api/ivr/status",
      }),
    );
    expect(mocks.rpcCreateOutreachAttempt).toHaveBeenCalledWith(
      { tenant: true },
      expect.objectContaining({
        contactId: 9001,
        campaignId: 42,
        userId: USER_ID,
        queueId: 501,
      }),
    );
    expect(mocks.insertCallForWorkspace).toHaveBeenCalledWith(
      WORKSPACE_ID,
      expect.objectContaining({ sid: "CAsid", outreach_attempt_id: 777 }),
    );
    expect(mocks.dequeueQueueEntry).toHaveBeenCalledWith({
      by: { id: 501 },
      userId: USER_ID,
      reason: "IVR call completed",
    });
    expect(outcome.kind).toBe("dispatched");
    expect(outcome.counts).toEqual({ called: 1, failed: 0, dequeued: 0, deferred: 0, exhausted: 0 });
    expect(outcome.queuedRemaining).toBe(0);
  });

  test("does not dial the same number twice in one campaign (#1517)", async () => {
    mocks.getCampaignQueueById.mockResolvedValue([
      queuedRow(),
      queuedRow({
        id: 502,
        contact_id: 9002,
        contact: { id: 9002, phone: "+16135550100", opt_out: false },
      }),
    ]);

    const outcome = (await dispatchCampaignIvrBatch({
      workspaceId: WORKSPACE_ID,
      campaignId: "42",
      userId: USER_ID,
    })) as Extract<Awaited<ReturnType<typeof dispatchCampaignIvrBatch>>, { kind: "dispatched" }>;

    expect(mocks.twilioCallCreate).toHaveBeenCalledTimes(1);
    expect(mocks.dequeueQueueEntry).toHaveBeenCalledWith({
      by: { id: 502 },
      userId: USER_ID,
      reason: "Duplicate IVR call prevented",
    });
    expect(outcome.counts).toEqual({ called: 1, failed: 0, dequeued: 1, deferred: 0, exhausted: 0 });
  });

  test("an out-of-window recipient stays queued for a later tick", async () => {
    mocks.getCampaignQueueById.mockResolvedValue([queuedRow(), queuedRow({ id: 502, contact_id: 9002, contact: { id: 9002, phone: "+16045550200", opt_out: false } })]);
    mocks.recipientCallingWindowStatus.mockImplementation((phone: string) => ({
      allowed: phone !== "+16045550200",
    }));

    const outcome = (await dispatchCampaignIvrBatch({
      workspaceId: WORKSPACE_ID,
      campaignId: "42",
      userId: USER_ID,
    })) as Extract<typeof outcome, { kind: "dispatched" }>;

    expect(outcome.counts).toEqual({ called: 1, failed: 0, dequeued: 0, deferred: 1, exhausted: 0 });
    expect(outcome.queuedRemaining).toBe(1);
    expect(mocks.dequeueQueueEntry).toHaveBeenCalledTimes(1);
  });

  test("an opted-out contact is dequeued without a call", async () => {
    mocks.getCampaignQueueById.mockResolvedValue([
      queuedRow({ contact: { id: 9001, phone: "+16135550100", opt_out: true } }),
    ]);

    const outcome = (await dispatchCampaignIvrBatch({
      workspaceId: WORKSPACE_ID,
      campaignId: "42",
      userId: USER_ID,
    })) as Extract<typeof outcome, { kind: "dispatched" }>;

    expect(mocks.twilioCallCreate).not.toHaveBeenCalled();
    expect(mocks.dequeueQueueEntry).toHaveBeenCalledWith({
      by: { id: 501 },
      userId: USER_ID,
      reason: "Contact opted out",
    });
    expect(outcome.counts).toEqual({ called: 0, failed: 0, dequeued: 1, deferred: 0, exhausted: 0 });
  });

  test("a failed Twilio call leaves the row queued and counts it", async () => {
    mocks.twilioCallCreate.mockRejectedValue(new Error("21215: invalid number"));

    const outcome = (await dispatchCampaignIvrBatch({
      workspaceId: WORKSPACE_ID,
      campaignId: "42",
      userId: USER_ID,
    })) as Extract<typeof outcome, { kind: "dispatched" }>;

    expect(outcome.counts).toEqual({ called: 0, failed: 1, dequeued: 0, deferred: 0, exhausted: 0 });
    expect(mocks.recordQueueAttemptFailure).toHaveBeenCalledWith(
      expect.objectContaining({ queueId: expect.any(Number), error: expect.any(String) }),
    );
    expect(mocks.rpcFailExhaustedCampaignQueueContacts).toHaveBeenCalledTimes(1);
    expect(outcome.queuedRemaining).toBe(1);
    expect(mocks.dequeueQueueEntry).not.toHaveBeenCalled();
  });

  test("rows beyond the claim stay queued (queuedRemaining includes truncation)", async () => {
    mocks.getCampaignQueueById.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => queuedRow({ id: 600 + i, contact_id: 9000 + i })),
    );

    const outcome = (await dispatchCampaignIvrBatch({
      workspaceId: WORKSPACE_ID,
      campaignId: "42",
      userId: USER_ID,
      maxContacts: 1,
    })) as Extract<typeof outcome, { kind: "dispatched" }>;

    expect(mocks.twilioCallCreate).toHaveBeenCalledTimes(1);
    expect(outcome.counts.called).toBe(1);
    expect(outcome.queuedRemaining).toBe(4);
  });

  test("an empty queue dispatches nothing and reports no remainder", async () => {
    mocks.getCampaignQueueById.mockResolvedValue([]);
    const outcome = (await dispatchCampaignIvrBatch({
      workspaceId: WORKSPACE_ID,
      campaignId: "42",
      userId: USER_ID,
    })) as Extract<typeof outcome, { kind: "dispatched" }>;

    expect(mocks.createWorkspaceTwilioInstance).not.toHaveBeenCalled();
    expect(outcome.counts).toEqual({ called: 0, failed: 0, dequeued: 0, deferred: 0, exhausted: 0 });
    expect(outcome.queuedRemaining).toBe(0);
  });
});
