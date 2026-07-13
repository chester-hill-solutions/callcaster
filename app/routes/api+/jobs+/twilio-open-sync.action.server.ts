import { data as routeData } from "react-router";
import { triggerTwilioOpenSync } from "@/lib/twilio-open-sync.server";
import { logger } from "@/lib/logger.server";
import { defineAction } from "@/lib/handler.server";

/**
 * HTTP endpoint for the twilio-open-sync periodic sweep.
 * Called by pg_cron via `net.http_post` (with x-cron-secret header).
 */
export const action = defineAction({
  // NOTE: the cron-secret guard lives in `handler` (not `auth`) because its
  // 401 is a `data()` result, not a `Response`, so it cannot short-circuit
  // from `auth` without changing the response shape.
  sideEffects: ["db-write", "twilio"],
  handler: async ({ request }) => {
    const cronSecret = process.env.CRON_SECRET;
    const headerSecret = request.headers.get("x-cron-secret");
    if (!cronSecret || headerSecret !== cronSecret) {
      return routeData({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : undefined;
    const callLimit = typeof body.callLimit === "number" ? body.callLimit : 50;
    const messageLimit = typeof body.messageLimit === "number" ? body.messageLimit : 50;
    const maxAgeMinutes = typeof body.maxAgeMinutes === "number" ? body.maxAgeMinutes : 120;

    try {
      const result = await triggerTwilioOpenSync({
        workspaceId: workspaceId ?? "",
        callLimit,
        messageLimit,
        maxAgeMinutes,
      });
      return result.ok
        ? routeData(result)
        : routeData({ error: result.error }, { status: 500 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Twilio open sync job failed", { workspaceId, error: message });
      return routeData({ error: message }, { status: 500 });
    }
  },
});
