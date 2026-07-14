import { defineCronEnqueueAction } from "@/lib/worker/cron-job-enqueue-route.server";

/**
 * Legacy HTTP cron entry for billing-reconcile.
 * WS-A: enqueue only — Bun worker owns execution.
 */
export const action = defineCronEnqueueAction({
  type: "billing_reconcile",
  buildParams: (_body, workspaceId) => ({ workspaceId }),
});
