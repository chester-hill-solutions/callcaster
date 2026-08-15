import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  enqueueJob: vi.fn(async () => ({ enqueued: true })),
  runCronWorkspaceFanout: vi.fn(async () => ({ ok: true })),
  reconcileWorkspaceBilling: vi.fn(async () => ({
    snapshot: { materialVariance: false },
  })),
  loadWorkspaceTwilioData: vi.fn(async () => ({})),
  readTwilioWorkspaceCredentials: vi.fn(() => ({ sid: "AC_test" })),
  triggerTwilioOpenSync: vi.fn(async () => ({ ok: true, message: "synced" })),
  runNumberRentalBilling: vi.fn(async () => ({ ok: true, processed: 1 })),
  runCampaignScheduleSync: vi.fn(async () => ({ scanned: 0, transitioned: 0 })),
}));

// Mock the enqueue layer rather than rescheduleJob: the handlers go through
// withReschedule -> rescheduleJob -> enqueueJob, and stubbing the middle of
// that chain would not exercise the ordering guarantee these tests exist for.
vi.mock("@/lib/worker/enqueue-job.server", () => ({
  enqueueJob: (...args: unknown[]) => mocks.enqueueJob(...args),
}));

vi.mock("@/lib/cron-workspace-fanout.server", () => ({
  runCronWorkspaceFanout: (...args: unknown[]) =>
    mocks.runCronWorkspaceFanout(...args),
}));
vi.mock("@/lib/billing-reconcile-workspace.server", () => ({
  reconcileWorkspaceBilling: (...args: unknown[]) =>
    mocks.reconcileWorkspaceBilling(...args),
}));
vi.mock("@/lib/merge-workspace-twilio-data.server", () => ({
  loadWorkspaceTwilioData: (...args: unknown[]) =>
    mocks.loadWorkspaceTwilioData(...args),
}));
vi.mock("@/lib/twilio-workspace-credentials", () => ({
  readTwilioWorkspaceCredentials: (...args: unknown[]) =>
    mocks.readTwilioWorkspaceCredentials(...args),
}));
vi.mock("@/lib/twilio-open-sync.server", () => ({
  triggerTwilioOpenSync: (...args: unknown[]) =>
    mocks.triggerTwilioOpenSync(...args),
}));
vi.mock("@/lib/number-rental-billing.server", () => ({
  runNumberRentalBilling: (...args: unknown[]) =>
    mocks.runNumberRentalBilling(...args),
}));
vi.mock("@/lib/campaign-schedule-sync.server", () => ({
  runCampaignScheduleSync: (...args: unknown[]) =>
    mocks.runCampaignScheduleSync(...args),
}));

import {
  billingReconcileHandler,
  campaignScheduleSyncHandler,
  numberRentalBillingHandler as realNumberRentalBillingHandler,
  twilioOpenSyncHandler as realTwilioOpenSyncHandler,
} from "@/lib/worker/handlers/cron.server";
import type { ClaimedJobRow } from "@/lib/worker/poll-jobs.server";

// The registry (handlers.server.ts) now validates `job.params` with a zod
// schema before calling the handler with the parsed result (#1239 A2). These
// wrappers stand in for that parse (same defaulting/coercion the real schemas
// apply) without pulling in handlers.server.ts's much larger dependency graph.
function twilioOpenSyncHandler(job: ClaimedJobRow) {
  const params = (job.params ?? {}) as Record<string, unknown>;
  return realTwilioOpenSyncHandler(job, {
    callLimit: typeof params.callLimit === "number" ? params.callLimit : 50,
    messageLimit: typeof params.messageLimit === "number" ? params.messageLimit : 50,
    maxAgeMinutes: typeof params.maxAgeMinutes === "number" ? params.maxAgeMinutes : 120,
  });
}

function numberRentalBillingHandler(job: ClaimedJobRow) {
  const params = (job.params ?? {}) as Record<string, unknown>;
  return realNumberRentalBillingHandler(job, {
    workspaceId: typeof params.workspaceId === "string" ? params.workspaceId : undefined,
  });
}

function makeJob(overrides: Partial<ClaimedJobRow> = {}): ClaimedJobRow {
  return {
    id: 1,
    type: "billing_reconcile",
    params: {},
    workspace_id: null,
    user_id: null,
    attempt_count: 1,
    max_attempts: 3,
    ...overrides,
  };
}

describe("cron handler self-reschedule gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("coordinator billing_reconcile self-reschedules", async () => {
    await billingReconcileHandler(makeJob({ type: "billing_reconcile" }));
    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({ type: "billing_reconcile" }),
    );
  });

  test("workspace-scoped billing_reconcile does not self-reschedule", async () => {
    await billingReconcileHandler(
      makeJob({
        type: "billing_reconcile",
        workspace_id: "ws-1",
        params: { workspaceId: "ws-1" },
      }),
    );
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
    expect(mocks.reconcileWorkspaceBilling).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      source: "cron",
    });
  });

  test("campaign_schedule_sync runs the sweep and self-reschedules", async () => {
    await campaignScheduleSyncHandler(makeJob({ type: "campaign_schedule_sync" }));
    expect(mocks.runCampaignScheduleSync).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({ type: "campaign_schedule_sync" }),
    );
  });

  test("campaign_schedule_sync still reschedules when the sweep throws", async () => {
    mocks.runCampaignScheduleSync.mockRejectedValueOnce(new Error("db down"));
    await expect(
      campaignScheduleSyncHandler(makeJob({ type: "campaign_schedule_sync" })),
    ).rejects.toThrow("db down");
    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({ type: "campaign_schedule_sync" }),
    );
  });

  test("coordinator twilio_open_sync self-reschedules", async () => {
    await twilioOpenSyncHandler(makeJob({ type: "twilio_open_sync" }));
    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "twilio_open_sync",
        params: expect.objectContaining({ callLimit: 50 }),
      }),
    );
  });

  test("workspace-scoped twilio_open_sync does not self-reschedule", async () => {
    await twilioOpenSyncHandler(
      makeJob({
        type: "twilio_open_sync",
        workspace_id: "ws-1",
        params: { workspaceId: "ws-1" },
      }),
    );
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
    expect(mocks.triggerTwilioOpenSync).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1" }),
    );
  });

  test("coordinator number_rental_billing self-reschedules", async () => {
    await numberRentalBillingHandler(makeJob({ type: "number_rental_billing" }));
    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({ type: "number_rental_billing" }),
    );
  });

  test("workspace-scoped number_rental_billing does not self-reschedule", async () => {
    await numberRentalBillingHandler(
      makeJob({
        type: "number_rental_billing",
        workspace_id: "ws-1",
        params: { workspaceId: "ws-1" },
      }),
    );
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
    expect(mocks.runNumberRentalBilling).toHaveBeenCalledWith({
      workspaceId: "ws-1",
    });
  });

  // These chains are the only scheduler. Rescheduling used to happen after the
  // work, so a throwing tick scheduled no successor: three failed attempts
  // dead-lettered the job and the money jobs never ran again until someone
  // redeployed the worker. The next occurrence must be queued regardless.
  describe("a failing tick must not kill the chain", () => {
    test("billing_reconcile still reschedules when the work throws", async () => {
      mocks.runCronWorkspaceFanout.mockRejectedValueOnce(new Error("db down"));

      await expect(
        billingReconcileHandler(makeJob({ type: "billing_reconcile" })),
      ).rejects.toThrow("db down");

      expect(mocks.enqueueJob).toHaveBeenCalledWith(
        expect.objectContaining({ type: "billing_reconcile" }),
      );
    });

    test("number_rental_billing still reschedules when the work throws", async () => {
      mocks.runCronWorkspaceFanout.mockRejectedValueOnce(new Error("boom"));

      await expect(
        numberRentalBillingHandler(makeJob({ type: "number_rental_billing" })),
      ).rejects.toThrow("boom");

      expect(mocks.enqueueJob).toHaveBeenCalledWith(
        expect.objectContaining({ type: "number_rental_billing" }),
      );
    });

    test("a failing reschedule does not mask the original error", async () => {
      mocks.runCronWorkspaceFanout.mockRejectedValueOnce(new Error("original"));
      mocks.enqueueJob.mockRejectedValueOnce(new Error("enqueue exploded"));

      await expect(
        billingReconcileHandler(makeJob({ type: "billing_reconcile" })),
      ).rejects.toThrow("original");
    });
  });
});
