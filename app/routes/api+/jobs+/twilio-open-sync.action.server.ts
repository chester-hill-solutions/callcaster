import { defineAction } from "@/lib/handler.server";
import { createCronEnqueueAction } from "@/lib/worker/cron-job-enqueue-route.server";

/**
 * Legacy HTTP cron entry for twilio-open-sync.
 * WS-A: enqueue only — Bun worker owns execution.
 */
export const action = defineAction(
  createCronEnqueueAction({
    type: "twilio_open_sync",
    buildParams: (body, workspaceId) => ({
      workspaceId,
      callLimit: typeof body.callLimit === "number" ? body.callLimit : 50,
      messageLimit:
        typeof body.messageLimit === "number" ? body.messageLimit : 50,
      maxAgeMinutes:
        typeof body.maxAgeMinutes === "number" ? body.maxAgeMinutes : 120,
    }),
  }),
);
