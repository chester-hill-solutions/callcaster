import { data as routeData } from "react-router";
import { loadBillingReconciliationReport } from "@/lib/billing-reconciliation.server";
import { persistWorkspaceBillingReconciliationSnapshot } from "@/lib/billing-reconciliation-snapshot.server";
import { createWorkspaceTwilioInstance } from "@/lib/database.server";
import { readTwilioWorkspaceCredentials } from "@/lib/twilio-workspace-credentials";
import { loadWorkspaceTwilioData } from "@/lib/merge-workspace-twilio-data.server";
import { logger } from "@/lib/logger.server";
import type { ActionFunctionArgs } from "react-router";

/**
 * HTTP endpoint for the billing-reconcile daily sweep.
 * Called by pg_cron via `net.http_post`.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : undefined;

  if (!workspaceId) {
    return routeData({ error: "Missing workspaceId" }, { status: 400 });
  }

  try {
    const twilioData = await loadWorkspaceTwilioData(workspaceId);
    const creds = readTwilioWorkspaceCredentials(twilioData);
    if (!creds?.sid) {
      return routeData(
        { error: "Workspace has no Twilio credentials" },
        { status: 400 },
      );
    }

    const twilio = await createWorkspaceTwilioInstance({
      workspace_id: workspaceId,
    });
    const usageRecords = await twilio.usage.records.list();
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
      workspaceId,
      twilioUsage,
    });
    const snapshot = await persistWorkspaceBillingReconciliationSnapshot({
      workspaceId,
      report,
      source: "cron",
    });

    return routeData({
      ok: true,
      materialVariance: snapshot.materialVariance,
      message: snapshot.materialVariance
        ? "Reconciliation complete — material variance detected."
        : "Reconciliation complete — no material variance.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Billing reconciliation job failed", { workspaceId, error: message });
    return routeData({ error: message }, { status: 500 });
  }
};
