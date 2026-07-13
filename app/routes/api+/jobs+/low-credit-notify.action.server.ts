import { data as routeData } from "react-router";
import { runLowCreditNotify } from "@/lib/low-credit-notify.server";
import { logger } from "@/lib/logger.server";
import { defineAction } from "@/lib/handler.server";

/**
 * HTTP endpoint for the low-credit notification sweep.
 * Called by pg_cron via `net.http_post` (with x-cron-secret header).
 */
export const action = defineAction({
  // NOTE: the cron-secret guard lives in `handler` (not `auth`) because its
  // 401 is a `data()` result, not a `Response`, so it cannot short-circuit
  // from `auth` without changing the response shape.
  sideEffects: ["db-read", "email"],
  handler: async ({ request }) => {
    const cronSecret = process.env.CRON_SECRET;
    const headerSecret = request.headers.get("x-cron-secret");
    if (!cronSecret || headerSecret !== cronSecret) {
      return routeData({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : undefined;

    try {
      const result = await runLowCreditNotify({ workspaceId });
      return routeData(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Low credit notify sweep failed", { workspaceId, error: message });
      return routeData({ error: message }, { status: 500 });
    }
  },
});
