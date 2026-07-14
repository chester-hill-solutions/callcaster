import { data as routeData } from "react-router";
import { loadBillingReconciliationReport } from "@/lib/billing-reconciliation.server";
import { persistWorkspaceBillingReconciliationSnapshot } from "@/lib/billing-reconciliation-snapshot.server";
import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import { readTwilioWorkspaceCredentials } from "@/lib/twilio-workspace-credentials";
import { loadWorkspaceTwilioData } from "@/lib/merge-workspace-twilio-data.server";
import { runCronWorkspaceFanout } from "@/lib/cron-workspace-fanout.server";
import { logger } from "@/lib/logger.server";
import { defineAction } from "@/lib/handler.server";

/** Full per-workspace reconcile: pull Twilio usage, build + persist snapshot. */
async function reconcileWorkspace(workspaceId: string) {
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
  return persistWorkspaceBillingReconciliationSnapshot({
    workspaceId,
    report,
    source: "cron",
  });
}

/**
 * HTTP endpoint for the billing-reconcile daily sweep.
 * Called by pg_cron via `net.http_post`.
 *
 * pg_cron posts `workspaceId: null`; a null/absent workspaceId fans out across
 * all workspaces with Twilio credentials (BILL-01 interim coordinator).
 */
export const action = defineAction({
  // NOTE: the cron-secret guard lives in `handler` (not `auth`) because its
  // 401 is a `data()` result, not a `Response`, so it cannot short-circuit
  // from `auth` without changing the response shape.
  sideEffects: ["db-write", "twilio"],
  handler: async ({ request }) => {
    const cronSecret = process.env.CRON_SECRET;
    const headerSecret = request.headers.get("x-cron-secret");
    if (!cronSecret || headerSecret !== cronSecret) {
      return routeData({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : undefined;

    if (!workspaceId) {
      // Fan out across all eligible workspaces; per-workspace failures are
      // reported in the body, not as a 500.
      try {
        const summary = await runCronWorkspaceFanout({
          job: "billing_reconcile",
          requireTwilioCredentials: true,
          run: reconcileWorkspace,
        });
        return routeData(summary);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("Billing reconciliation sweep failed", { error: message });
        return routeData({ error: message }, { status: 500 });
      }
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

      const snapshot = await reconcileWorkspace(workspaceId);

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
  },
});
