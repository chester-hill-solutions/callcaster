import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  rescheduleJob: vi.fn(async () => undefined),
  runCronWorkspaceFanout: vi.fn(async () => ({ ok: true })),
  reconcileWorkspaceBilling: vi.fn(async () => ({
    snapshot: { materialVariance: false },
  })),
  loadWorkspaceTwilioData: vi.fn(async () => ({})),
  readTwilioWorkspaceCredentials: vi.fn(() => ({ sid: "AC_test" })),
  triggerTwilioOpenSync: vi.fn(async () => ({ ok: true, message: "synced" })),
  runNumberRentalBilling: vi.fn(async () => ({ ok: true, processed: 1 })),
}));

vi.mock("@/lib/worker/handlers/shared.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/worker/handlers/shared.server")>();
  return {
    ...actual,
    rescheduleJob: (...args: unknown[]) => mocks.rescheduleJob(...args),
  };
});

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

import {
  billingReconcileHandler,
  numberRentalBillingHandler,
  twilioOpenSyncHandler,
} from "@/lib/worker/handlers/cron.server";
import type { ClaimedJobRow } from "@/lib/worker/poll-jobs.server";

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
    expect(mocks.rescheduleJob).toHaveBeenCalledWith(
      "billing_reconcile",
      expect.any(Number),
      {},
      1,
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
    expect(mocks.rescheduleJob).not.toHaveBeenCalled();
    expect(mocks.reconcileWorkspaceBilling).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      source: "cron",
    });
  });

  test("coordinator twilio_open_sync self-reschedules", async () => {
    await twilioOpenSyncHandler(makeJob({ type: "twilio_open_sync" }));
    expect(mocks.rescheduleJob).toHaveBeenCalledWith(
      "twilio_open_sync",
      expect.any(Number),
      expect.objectContaining({ callLimit: 50 }),
      1,
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
    expect(mocks.rescheduleJob).not.toHaveBeenCalled();
    expect(mocks.triggerTwilioOpenSync).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1" }),
    );
  });

  test("coordinator number_rental_billing self-reschedules", async () => {
    await numberRentalBillingHandler(makeJob({ type: "number_rental_billing" }));
    expect(mocks.rescheduleJob).toHaveBeenCalledWith(
      "number_rental_billing",
      expect.any(Number),
      {},
      1,
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
    expect(mocks.rescheduleJob).not.toHaveBeenCalled();
    expect(mocks.runNumberRentalBilling).toHaveBeenCalledWith({
      workspaceId: "ws-1",
    });
  });
});
