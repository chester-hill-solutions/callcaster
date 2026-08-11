/**
 * Worker campaign_dispatch handler: claim/successor/completion orchestration
 * around the shared SMS batch module, plus the launchCampaign enqueue contract.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  dispatchCampaignSmsBatch: vi.fn(),
  enqueueJob: vi.fn(async () => ({ enqueued: true, jobId: 99 })),
  findCampaignInWorkspace: vi.fn(),
  updateCampaignStatusInWorkspace: vi.fn(async () => undefined),
  rpcTryCompleteCampaignIfDrained: vi.fn(async () => true),
  createTenantDb: vi.fn(() => ({ tenant: true })),
  getCampaignReadiness: vi.fn(() => ({
    issues: [],
    startDisabledReason: null,
    scheduleDisabledReason: null,
  })),
}));

vi.mock("@/lib/campaign-sms-dispatch.server", () => ({
  dispatchCampaignSmsBatch: mocks.dispatchCampaignSmsBatch,
}));
vi.mock("@/lib/worker/enqueue-job.server", () => ({
  enqueueJob: mocks.enqueueJob,
}));
vi.mock("@/lib/campaign-ivr.server", () => ({
  findCampaignInWorkspace: mocks.findCampaignInWorkspace,
  updateCampaignStatusInWorkspace: mocks.updateCampaignStatusInWorkspace,
}));
vi.mock("@/lib/db-rpc.server", () => ({
  rpcTryCompleteCampaignIfDrained: mocks.rpcTryCompleteCampaignIfDrained,
}));
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: mocks.createTenantDb,
}));
vi.mock("@/lib/campaign-readiness", () => ({
  getCampaignReadiness: mocks.getCampaignReadiness,
}));
vi.mock("@/lib/logger.server", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
// Sibling handlers in the same module pull heavy deps; stub them out.
vi.mock("@/lib/audience-upload-process.server", () => ({
  processAudienceUpload: vi.fn(),
}));
vi.mock("@/lib/campaign-export.server", () => ({
  processCallCampaignExport: vi.fn(),
  processMessageCampaignExport: vi.fn(),
}));
vi.mock("@/lib/workspace-webhooks.server", () => ({
  sendWorkspaceWebhookNotification: vi.fn(),
}));
vi.mock("@/lib/twilio-compliance-job.server", () => ({
  runWorkspaceTwilioComplianceJob: vi.fn(),
}));

import { campaignDispatchHandler } from "@/lib/worker/handlers/campaign.server";
import { launchCampaign } from "@/lib/campaign-execution.server";
import type { ClaimedJobRow } from "@/lib/worker/poll-jobs.server";

const WORKSPACE_ID = "3b6f0a52-6f5e-4b2d-9d55-000000000001";
const USER_ID = "3b6f0a52-6f5e-4b2d-9d55-000000000002";

function makeJob(overrides?: Partial<ClaimedJobRow>): ClaimedJobRow {
  return {
    id: 7,
    type: "campaign_dispatch",
    params: { campaignId: 42, workspaceId: WORKSPACE_ID, userId: USER_ID },
    workspace_id: WORKSPACE_ID,
    user_id: USER_ID,
    attempt_count: 0,
    max_attempts: 3,
    ...overrides,
  };
}

function runningMessageCampaign(overrides?: Record<string, unknown>) {
  return {
    id: 42,
    type: "message",
    status: "running",
    end_date: null,
    ...overrides,
  };
}

function dispatchedOutcome(overrides?: {
  counts?: Partial<{ sent: number; failed: number; dequeued: number; deferred: number }>;
  queuedRemaining?: number;
}) {
  return {
    kind: "dispatched" as const,
    responses: [],
    counts: { sent: 1, failed: 0, dequeued: 0, deferred: 0, ...overrides?.counts },
    queuedRemaining: overrides?.queuedRemaining ?? 0,
  };
}

describe("campaignDispatchHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findCampaignInWorkspace.mockResolvedValue(runningMessageCampaign());
    mocks.dispatchCampaignSmsBatch.mockResolvedValue(dispatchedOutcome());
    mocks.rpcTryCompleteCampaignIfDrained.mockResolvedValue(false);
  });

  test("throws when no launching user is attributed", async () => {
    const job = makeJob({ user_id: null, params: { campaignId: 42, workspaceId: WORKSPACE_ID } });
    await expect(campaignDispatchHandler(job)).rejects.toThrow(/userId/);
    expect(mocks.dispatchCampaignSmsBatch).not.toHaveBeenCalled();
  });

  test("falls back to params.userId when job.user_id is null", async () => {
    const job = makeJob({ user_id: null });
    await campaignDispatchHandler(job);
    expect(mocks.dispatchCampaignSmsBatch).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID }),
    );
  });

  test("skips non-message campaigns without dispatching", async () => {
    mocks.findCampaignInWorkspace.mockResolvedValue(
      runningMessageCampaign({ type: "live_call" }),
    );
    const result = await campaignDispatchHandler(makeJob());
    expect(result).toMatchObject({ ok: true, skipped: true, reason: "not_message_campaign" });
    expect(mocks.dispatchCampaignSmsBatch).not.toHaveBeenCalled();
  });

  test("claims a scheduled campaign into running before dispatching", async () => {
    mocks.findCampaignInWorkspace.mockResolvedValue(
      runningMessageCampaign({ status: "scheduled" }),
    );
    await campaignDispatchHandler(makeJob());
    expect(mocks.updateCampaignStatusInWorkspace).toHaveBeenCalledWith(
      WORKSPACE_ID,
      42,
      expect.objectContaining({ status: "running" }),
    );
    expect(mocks.dispatchCampaignSmsBatch).toHaveBeenCalled();
  });

  test("paused campaign ends the chain without dispatching", async () => {
    mocks.findCampaignInWorkspace.mockResolvedValue(
      runningMessageCampaign({ status: "paused" }),
    );
    const result = await campaignDispatchHandler(makeJob());
    expect(result).toMatchObject({ ok: true, skipped: true, reason: "paused" });
    expect(mocks.dispatchCampaignSmsBatch).not.toHaveBeenCalled();
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });

  test("dispatches a bounded batch attributed to the launching user", async () => {
    await campaignDispatchHandler(makeJob());
    expect(mocks.dispatchCampaignSmsBatch).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      campaignId: "42",
      userId: USER_ID,
      maxContacts: expect.any(Number),
    });
  });

  test("remaining work schedules a campaign-scoped successor excluding this job", async () => {
    mocks.dispatchCampaignSmsBatch.mockResolvedValue(
      dispatchedOutcome({ queuedRemaining: 5 }),
    );
    await campaignDispatchHandler(makeJob());
    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "campaign_dispatch",
        workspaceId: WORKSPACE_ID,
        userId: USER_ID,
        params: expect.objectContaining({
          campaignId: 42,
          workspaceId: WORKSPACE_ID,
          userId: USER_ID,
        }),
        dedupe: {
          kind: "live",
          workspaceId: WORKSPACE_ID,
          campaignId: 42,
          excludeJobId: 7,
        },
      }),
    );
    expect(mocks.rpcTryCompleteCampaignIfDrained).not.toHaveBeenCalled();
  });

  test("drained queue attempts completion instead of a successor", async () => {
    mocks.dispatchCampaignSmsBatch.mockResolvedValue(
      dispatchedOutcome({ queuedRemaining: 0 }),
    );
    await campaignDispatchHandler(makeJob());
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
    expect(mocks.rpcTryCompleteCampaignIfDrained).toHaveBeenCalledWith(
      expect.anything(),
      42,
    );
  });

  test("a fully failed batch throws so the job retries with backoff", async () => {
    mocks.dispatchCampaignSmsBatch.mockResolvedValue(
      dispatchedOutcome({
        counts: { sent: 0, failed: 3, dequeued: 0, deferred: 0 },
        queuedRemaining: 3,
      }),
    );
    await expect(campaignDispatchHandler(makeJob())).rejects.toThrow(/sends failed/);
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });

  test("partial failure still schedules a successor for the queued remainder", async () => {
    mocks.dispatchCampaignSmsBatch.mockResolvedValue(
      dispatchedOutcome({
        counts: { sent: 2, failed: 1, dequeued: 0, deferred: 0 },
        queuedRemaining: 1,
      }),
    );
    const result = await campaignDispatchHandler(makeJob());
    expect(result).toMatchObject({ ok: true, sent: 2, failed: 1 });
    expect(mocks.enqueueJob).toHaveBeenCalled();
  });

  test("send-window deferral schedules a delayed successor", async () => {
    mocks.dispatchCampaignSmsBatch.mockResolvedValue({ kind: "deferred_send_window" });
    const result = await campaignDispatchHandler(makeJob());
    expect(result).toMatchObject({ ok: true, deferred: "send_window" });
    const call = mocks.enqueueJob.mock.calls[0]?.[0] as { runAt: Date };
    expect(call.runAt.getTime()).toBeGreaterThan(Date.now() + 60_000);
  });

  test("insufficient credits stops the chain without retry", async () => {
    mocks.dispatchCampaignSmsBatch.mockResolvedValue({ kind: "insufficient_credits" });
    const result = await campaignDispatchHandler(makeJob());
    expect(result).toMatchObject({ ok: true, blocked: "insufficient_credits" });
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });
});

describe("launchCampaign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enqueueJob.mockResolvedValue({ enqueued: true, jobId: 99 });
  });

  const baseArgs = {
    workspaceId: WORKSPACE_ID,
    campaignId: "42",
    campaign: {
      type: "message",
      end_date: null,
      start_date: null,
    } as never,
    campaignDetails: null,
    queueCount: 3,
  };

  test("message launch enqueues with the launching user and campaign-scoped dedupe", async () => {
    const result = await launchCampaign({
      ...baseArgs,
      mode: "now",
      userId: USER_ID,
    });
    expect(result.ok).toBe(true);
    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "campaign_dispatch",
        workspaceId: WORKSPACE_ID,
        userId: USER_ID,
        params: expect.objectContaining({ campaignId: 42, userId: USER_ID }),
        dedupe: { kind: "live", workspaceId: WORKSPACE_ID, campaignId: 42 },
      }),
    );
  });

  test("launch without a user is rejected", async () => {
    const result = await launchCampaign({
      ...baseArgs,
      mode: "now",
      userId: "",
    });
    expect(result.ok).toBe(false);
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });
});
