import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * Reconciliation compares Twilio usage against the credit ledger. Both sides
 * must cover the SAME window, and nothing verified that they did.
 *
 * `usage.records.list()` with no arguments returns all-time totals per
 * category, while the report scopes the ledger to the last 30 days — so the
 * variance was all-time Twilio units minus 30 days of ledger events, growing
 * without bound as an account ages until materialVariance was permanently true
 * and the drift alert permanently meaningless.
 *
 * The existing unit tests could not catch it: their fixtures pass usage records
 * carrying no dates at all, alongside a period, so the window agreement is
 * assumed by construction. These assert the wiring instead.
 */
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  createWorkspaceTwilioInstance: vi.fn(),
  loadBillingReconciliationReport: vi.fn(),
  persistSnapshot: vi.fn(),
  handleDrift: vi.fn(),
}));

vi.mock("@/lib/database/workspace.server", () => ({
  createWorkspaceTwilioInstance: (...a: unknown[]) => mocks.createWorkspaceTwilioInstance(...a),
}));
vi.mock("@/lib/twilio-client.server", () => ({
  withTwilioRetry: (fn: () => unknown) => fn(),
}));
vi.mock("@/lib/billing-reconciliation.server", () => ({
  loadBillingReconciliationReport: (...a: unknown[]) =>
    mocks.loadBillingReconciliationReport(...a),
}));
vi.mock("@/lib/billing-reconciliation-snapshot.server", () => ({
  persistWorkspaceBillingReconciliationSnapshot: (...a: unknown[]) => mocks.persistSnapshot(...a),
}));
vi.mock("@/lib/billing-reconciliation-alert.server", () => ({
  handleBillingReconciliationDrift: (...a: unknown[]) => mocks.handleDrift(...a),
}));

import { reconcileWorkspaceBilling } from "@/lib/billing-reconcile-workspace.server";

describe("reconcileWorkspaceBilling", () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset();
    mocks.list.mockResolvedValue([]);
    mocks.createWorkspaceTwilioInstance.mockResolvedValue({
      usage: { records: { list: (...a: unknown[]) => mocks.list(...a) } },
    });
    mocks.loadBillingReconciliationReport.mockResolvedValue({ categories: {} });
    mocks.persistSnapshot.mockResolvedValue({ materialVariance: false });
  });

  test("requests a bounded usage window, never all-time totals", async () => {
    await reconcileWorkspaceBilling({ workspaceId: "ws-1", source: "cron" });

    expect(mocks.list).toHaveBeenCalledTimes(1);
    const params = mocks.list.mock.calls[0]![0];
    expect(params, "usage.records.list() with no args returns ALL-TIME totals").toBeDefined();
    expect(params.startDate).toBeInstanceOf(Date);
    expect(params.endDate).toBeInstanceOf(Date);
  });

  test("the usage window matches the window the report scopes the ledger to", async () => {
    await reconcileWorkspaceBilling({ workspaceId: "ws-1", source: "cron" });

    const { startDate, endDate } = mocks.list.mock.calls[0]![0];
    const { referenceDate } = mocks.loadBillingReconciliationReport.mock.calls[0]![0];

    // The report derives its ledger period from this same referenceDate, so
    // passing it is what guarantees one window rather than two that merely
    // happen to agree.
    expect(referenceDate).toBeInstanceOf(Date);
    expect(endDate.getTime()).toBeLessThanOrEqual(referenceDate.getTime() + 86_400_000);

    const spanDays = Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000);
    expect(spanDays).toBe(30);
  });
});
