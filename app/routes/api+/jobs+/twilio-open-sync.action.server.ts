import { defineAction } from "@/lib/handler.server";
import { TWILIO_OPEN_SYNC_DEFAULTS } from "@/lib/worker/job-types.server";
import { createCronEnqueueAction } from "@/lib/worker/cron-job-enqueue-route.server";

/**
 * A sweep limit must be a positive integer. Anything else falls back to the
 * sweep's default rather than being stored: Drizzle emits LIMIT only for a number
 * >= 0, so a negative limit silently turned the "bounded" sweep into an unbounded
 * read of every open row, and a non-positive maxAgeMinutes collapsed the 404
 * grace window so every unknown open call was terminalized as failed (#2896).
 */
function sweepNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1
    ? value
    : fallback;
}

/**
 * Legacy HTTP cron entry for twilio-open-sync.
 * WS-A: enqueue only — Bun worker owns execution.
 */
export const action = defineAction(
  createCronEnqueueAction({
    type: "twilio_open_sync",
    // `workspaceId` isn't in `twilio_open_sync`'s params schema — the job's
    // top-level `workspaceId` (passed by `createCronEnqueueAction` alongside
    // these params) is what `resolveWorkspaceId` reads.
    buildParams: (body) => ({
      callLimit: sweepNumber(
        body.callLimit,
        TWILIO_OPEN_SYNC_DEFAULTS.callLimit,
      ),
      messageLimit: sweepNumber(
        body.messageLimit,
        TWILIO_OPEN_SYNC_DEFAULTS.messageLimit,
      ),
      maxAgeMinutes: sweepNumber(
        body.maxAgeMinutes,
        TWILIO_OPEN_SYNC_DEFAULTS.maxAgeMinutes,
      ),
    }),
  }),
);
