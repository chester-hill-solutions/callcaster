import { data as routeData } from "react-router";
import { defineAction } from "@/lib/handler.server";
import { enqueueJob } from "@/lib/worker/enqueue-job.server";

/**
 * Legacy HTTP cron entry for low-credit-notify.
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

    const result = await enqueueJob({
      type: "low_credit_notify",
      workspaceId,
      params: { workspaceId },
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
