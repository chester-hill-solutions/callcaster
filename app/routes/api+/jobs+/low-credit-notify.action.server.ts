import { defineAction } from "@/lib/handler.server";
import { createCronEnqueueAction } from "@/lib/worker/cron-job-enqueue-route.server";

/**
 * Legacy HTTP cron entry for low-credit-notify.
 * WS-A: enqueue only — Bun worker owns execution.
 */
export const action = defineAction(
  createCronEnqueueAction({
    type: "low_credit_notify",
    buildParams: (_body, workspaceId) => ({ workspaceId }),
  }),
);
