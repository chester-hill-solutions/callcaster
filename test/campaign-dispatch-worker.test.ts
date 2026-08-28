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
  dispatchCampaignIvrBatch: vi.fn(),
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
vi.mock("@/lib/campaign-ivr-dispatch.server", () => ({
  dispatchCampaignIvrBatch: mocks.dispatchCampaignIvrBatch,
}));
vi.mock("@/lib/worker/enqueue-job.server", () => ({
  unsafeEnqueueJob: mocks.enqueueJob,
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

import {
  campaignDispatchHandler as realCampaignDispatchHandler,
  type CampaignDispatchParams,
} from "@/lib/worker/handlers/campaign.server";
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

// The registry (handlers.server.ts) now validates `job.params` with a zod
// schema before calling the handler with the parsed result (#1239 A2). Every
// fixture in this file is already well-typed, so casting stands in for that
// parse without pulling in handlers.server.ts's much larger dependency graph.
function campaignDispatchHandler(job: ClaimedJobRow) {
  return realCampaignDispatchHandler(job, job.params as CampaignDispatchParams);
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

  test("skips non-dispatchable campaigns without dispatching", async () => {
    mocks.findCampaignInWorkspace.mockResolvedValue(
      runningMessageCampaign({ type: "live_call" }),
    );
    const result = await campaignDispatchHandler(makeJob());
    expect(result).toMatchObject({ ok: true, skipped: true, reason: "not_dispatchable_campaign" });
    expect(mocks.dispatchCampaignSmsBatch).not.toHaveBeenCalled();
    expect(mocks.dispatchCampaignIvrBatch).not.toHaveBeenCalled();
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

  test("send-window deferral schedules the successor at the exact next open (#1352)", async () => {
    const nextOpenAt = new Date(Date.now() + 5 * 60 * 1000);
    mocks.dispatchCampaignSmsBatch.mockResolvedValue({
      kind: "deferred_send_window",
      nextOpenAt,
    });
    await campaignDispatchHandler(makeJob());
    const call = mocks.enqueueJob.mock.calls.at(-1)?.[0] as { runAt: Date };
    expect(call.runAt).toBeInstanceOf(Date);
    // Two Date.now() calls (handler + successor) may differ by a tick —
    // require the scheduled instant to land on the window boundary.
    expect(Math.abs(call.runAt.getTime() - nextOpenAt.getTime())).toBeLessThanOrEqual(50);
  });

  test("a far-future window boundary is capped so a stale schedule cannot pin the chain", async () => {
    // Window opens in 3 days; if the operator edits or removes the window
    // meanwhile, the next wake must re-read the campaign well before then.
    const maxDeferMs = 60 * 60 * 1000;
    const nextOpenAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    mocks.dispatchCampaignSmsBatch.mockResolvedValue({
      kind: "deferred_send_window",
      nextOpenAt,
    });
    await campaignDispatchHandler(makeJob());
    const call = mocks.enqueueJob.mock.calls.at(-1)?.[0] as { runAt: Date };
    expect(call.runAt.getTime()).toBeLessThan(nextOpenAt.getTime());
    const expectedWake = Date.now() + maxDeferMs;
    expect(Math.abs(call.runAt.getTime() - expectedWake)).toBeLessThanOrEqual(100);
  });

  test("insufficient credits stops the chain without retry", async () => {
    mocks.dispatchCampaignSmsBatch.mockResolvedValue({ kind: "insufficient_credits" });
    const result = await campaignDispatchHandler(makeJob());
    expect(result).toMatchObject({ ok: true, blocked: "insufficient_credits" });
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });
});

describe("campaignDispatchHandler — machine-dialled voice (#1348)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findCampaignInWorkspace.mockResolvedValue(
      runningMessageCampaign({ type: "simple_ivr" }),
    );
    mocks.dispatchCampaignIvrBatch.mockResolvedValue({
      kind: "dispatched",
      counts: { called: 1, failed: 0, dequeued: 0, deferred: 0 },
      queuedRemaining: 0,
    });
    mocks.rpcTryCompleteCampaignIfDrained.mockResolvedValue(false);
  });

  test("dispatches an IVR batch for a running voice campaign", async () => {
    const result = await campaignDispatchHandler(makeJob());
    expect(mocks.dispatchCampaignIvrBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        campaignId: "42",
        userId: USER_ID,
      }),
    );
    expect(mocks.dispatchCampaignSmsBatch).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, called: 1, queuedRemaining: 0 });
  });

  test("transitions a scheduled voice campaign to running before dispatching", async () => {
    mocks.findCampaignInWorkspace.mockResolvedValue(
      runningMessageCampaign({ type: "robocall", status: "scheduled" }),
    );
    await campaignDispatchHandler(makeJob());
    expect(mocks.updateCampaignStatusInWorkspace).toHaveBeenCalledWith(
      WORKSPACE_ID,
      42,
      expect.objectContaining({ status: "running" }),
    );
    expect(mocks.dispatchCampaignIvrBatch).toHaveBeenCalled();
  });

  test("a waiting voice campaign keeps the chain alive until the sweep flips it", async () => {
    mocks.findCampaignInWorkspace.mockResolvedValue(
      runningMessageCampaign({ type: "simple_ivr", status: "waiting" }),
    );
    const result = await campaignDispatchHandler(makeJob());
    expect(result).toMatchObject({ ok: true, deferred: "waiting_for_schedule" });
    expect(mocks.dispatchCampaignIvrBatch).not.toHaveBeenCalled();
    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ campaignId: 42 }),
        dedupe: { kind: "live", workspaceId: WORKSPACE_ID, campaignId: 42, excludeJobId: 7 },
      }),
    );
  });

  test("paused voice campaign ends the chain without dispatching", async () => {
    mocks.findCampaignInWorkspace.mockResolvedValue(
      runningMessageCampaign({ type: "simple_ivr", status: "paused" }),
    );
    const result = await campaignDispatchHandler(makeJob());
    expect(result).toMatchObject({ ok: true, skipped: true, reason: "paused" });
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });

  test("IVR remaining work schedules a successor and drain completes the campaign", async () => {
    mocks.dispatchCampaignIvrBatch.mockResolvedValue({
      kind: "dispatched",
      counts: { called: 2, failed: 0, dequeued: 0, deferred: 0 },
      queuedRemaining: 3,
    });
    await campaignDispatchHandler(makeJob());
    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({ dedupe: expect.objectContaining({ excludeJobId: 7 }) }),
    );
    expect(mocks.rpcTryCompleteCampaignIfDrained).not.toHaveBeenCalled();

    mocks.dispatchCampaignIvrBatch.mockResolvedValue({
      kind: "dispatched",
      counts: { called: 1, failed: 0, dequeued: 0, deferred: 0 },
      queuedRemaining: 0,
    });
    await campaignDispatchHandler(makeJob());
    expect(mocks.rpcTryCompleteCampaignIfDrained).toHaveBeenCalledWith(
      { tenant: true },
      42,
    );
  });

  test("a fully failed IVR batch throws so the job retries with backoff", async () => {
    mocks.dispatchCampaignIvrBatch.mockResolvedValue({
      kind: "dispatched",
      counts: { called: 0, failed: 2, dequeued: 0, deferred: 0 },
      queuedRemaining: 2,
    });
    await expect(campaignDispatchHandler(makeJob())).rejects.toThrow(/all 2 IVR calls failed/);
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });

  test("IVR insufficient credits and missing caller-id stop the chain", async () => {
    mocks.dispatchCampaignIvrBatch.mockResolvedValue({ kind: "insufficient_credits" });
    expect(await campaignDispatchHandler(makeJob())).toMatchObject({
      blocked: "insufficient_credits",
    });
    expect(mocks.enqueueJob).not.toHaveBeenCalled();

    mocks.dispatchCampaignIvrBatch.mockResolvedValue({ kind: "caller_id_required" });
    expect(await campaignDispatchHandler(makeJob())).toMatchObject({
      blocked: "caller_id_required",
    });
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });

  test("IVR schedule deferral schedules a delayed successor", async () => {
    mocks.dispatchCampaignIvrBatch.mockResolvedValue({ kind: "deferred_send_window" });
    const result = await campaignDispatchHandler(makeJob());
    expect(result).toMatchObject({ ok: true, deferred: "send_window" });
    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({ runAt: expect.any(Date) }),
    );
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

  test("machine-dialled voice launch enqueues dispatch like a message launch", async () => {
    for (const type of ["robocall", "simple_ivr", "complex_ivr"]) {
      vi.clearAllMocks();
      mocks.enqueueJob.mockResolvedValue({ enqueued: true, jobId: 99 });
      const result = await launchCampaign({
        ...baseArgs,
        campaign: { type, end_date: null, start_date: null } as never,
        mode: "now",
        userId: USER_ID,
      });
      expect(result.ok).toBe(true);
      expect(mocks.enqueueJob).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "campaign_dispatch",
          params: expect.objectContaining({ campaignId: 42 }),
        }),
      );
    }
  });

  test("scheduled voice launch defers the dispatch job to the start date", async () => {
    const startDate = "2026-09-01T09:00:00.000Z";
    const result = await launchCampaign({
      ...baseArgs,
      campaign: { type: "simple_ivr", end_date: null, start_date: startDate } as never,
      mode: "scheduled",
      userId: USER_ID,
    });
    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ status: "scheduled" });
    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({ runAt: startDate }),
    );
  });

  test("live_call launch changes status without enqueueing dispatch", async () => {
    const result = await launchCampaign({
      ...baseArgs,
      campaign: { type: "live_call", end_date: null, start_date: null } as never,
      mode: "now",
      userId: USER_ID,
    });
    expect(result.ok).toBe(true);
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
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
