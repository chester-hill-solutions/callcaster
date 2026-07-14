import { defineAction } from "@/lib/handler.server";
import { createCronEnqueueAction } from "@/lib/worker/cron-job-enqueue-route.server";

/**
 * Legacy HTTP cron entry for number-rental-billing.
 * WS-A: enqueue only — Bun worker owns execution.
 */
export const action = defineAction(
  createCronEnqueueAction({
    type: "number_rental_billing",
    buildParams: (_body, workspaceId) => ({ workspaceId }),
  }),
);
