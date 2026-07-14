import { defineCronEnqueueAction } from "@/lib/worker/cron-job-enqueue-route.server";

/**
 * Legacy HTTP cron entry for low-credit-notify.
 * WS-A: enqueue only — Bun worker owns execution.
 */
export const action = defineCronEnqueueAction({
  type: "low_credit_notify",
  buildParams: (_body, workspaceId) => ({ workspaceId }),
});
