import { data as routeData } from "react-router";
import { defineAction } from "@/lib/handler.server";
import { enqueueJob } from "@/lib/worker/enqueue-job.server";

/**
 * Legacy HTTP cron entry for twilio-open-sync.
 * WS-A: enqueue only — Bun worker owns execution.
 */
export const action = defineAction({
  sideEffects: ["db-write"],
  handler: async ({ request }) => {
    const cronSecret = process.env.CRON_SECRET;
    const headerSecret = request.headers.get("x-cron-secret");
    if (!cronSecret || headerSecret !== cronSecret) {
      return routeData({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const workspaceId =
      typeof body.workspaceId === "string" ? body.workspaceId : undefined;
    const callLimit = typeof body.callLimit === "number" ? body.callLimit : 50;
    const messageLimit =
      typeof body.messageLimit === "number" ? body.messageLimit : 50;
    const maxAgeMinutes =
      typeof body.maxAgeMinutes === "number" ? body.maxAgeMinutes : 120;

    const result = await enqueueJob({
      type: "twilio_open_sync",
      workspaceId,
      params: { workspaceId, callLimit, messageLimit, maxAgeMinutes },
      dedupe: { kind: "live", workspaceId },
    });
    return routeData({
      ok: true as const,
      enqueued: result.enqueued,
      deduped: result.deduped ?? !result.enqueued,
      jobId: result.jobId,
    });
  },
});
