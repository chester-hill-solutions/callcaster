import { loadBillingReconciliationReport } from "@/lib/billing-reconciliation.server";
import { handleBillingReconciliationDrift } from "@/lib/billing-reconciliation-alert.server";
import {
  persistWorkspaceBillingReconciliationSnapshot,
  type BillingReconciliationSnapshot,
} from "@/lib/billing-reconciliation-snapshot.server";
import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import { withTwilioRetry } from "@/lib/twilio-client.server";
import type { BillingReconciliationReport } from "../../shared/billing-reconciliation";

export type ReconcileWorkspaceBillingResult = {
  report: BillingReconciliationReport;
  snapshot: BillingReconciliationSnapshot;
};

/**
 * Pull Twilio usage, build reconciliation report, persist snapshot, and
 * emit drift alerts when material variance is detected.
 */
export async function reconcileWorkspaceBilling(args: {
  workspaceId: string;
  source: BillingReconciliationSnapshot["lastRunSource"];
}): Promise<ReconcileWorkspaceBillingResult> {
  const twilio = await createWorkspaceTwilioInstance({
    workspace_id: args.workspaceId,
  });
  // Money path: this drives reconciliation variance, so a transient Twilio
  // blip should retry rather than report a false discrepancy. Everything else
  // in the compliance modules already goes through withTwilioRetry.
  const usageRecords = await withTwilioRetry(
    () => twilio.usage.records.list(),
    { workspaceId: args.workspaceId, operation: "billing_reconcile_usage_list" },
  );
  const twilioUsage = usageRecords.map((record) => ({
    category: record.category,
    description: record.description,
    usage: record.usage,
    usageUnit: record.usageUnit,
    price: record.price.toString(),
    startDate: record.startDate?.toISOString(),
    endDate: record.endDate?.toISOString(),
  }));

  const report = await loadBillingReconciliationReport({
    workspaceId: args.workspaceId,
    twilioUsage,
  });
  const snapshot = await persistWorkspaceBillingReconciliationSnapshot({
    workspaceId: args.workspaceId,
    report,
    source: args.source,
  });

  await handleBillingReconciliationDrift({
    workspaceId: args.workspaceId,
    report,
    snapshot,
    cleared: !snapshot.materialVariance,
  });

  return { report, snapshot };
}
