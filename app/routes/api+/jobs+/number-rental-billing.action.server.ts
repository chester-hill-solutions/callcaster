import { data as routeData } from "react-router";
import { defineAction } from "@/lib/handler.server";
import { enqueueCronJobRow } from "@/lib/worker/enqueue-cron-job.server";

/**
 * Legacy HTTP cron entry for number-rental-billing.
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

    const result = await enqueueCronJobRow({
      type: "number_rental_billing",
      workspaceId,
      params: { workspaceId },
    });
    return routeData(result);
  },
});
