import { data as routeData } from "react-router";
import { runNumberRentalBilling } from "@/lib/number-rental-billing.server";
import { runCronWorkspaceFanout } from "@/lib/cron-workspace-fanout.server";
import { logger } from "@/lib/logger.server";
import { defineAction } from "@/lib/handler.server";

/**
 * HTTP endpoint for the number-rental-billing daily sweep.
 * Called by pg_cron via `net.http_post` (with x-cron-secret header).
 *
 * pg_cron posts `workspaceId: null`; a null/absent workspaceId fans out across
 * all workspaces (BILL-01 interim coordinator). Rental billing needs only the
 * tenant DB + Resend, so no Twilio-credential eligibility gate applies.
 */
export const action = defineAction({
  // NOTE: the cron-secret guard lives in `handler` (not `auth`) because its
  // 401 is a `data()` result, not a `Response`, so it cannot short-circuit
  // from `auth` without changing the response shape.
  sideEffects: ["db-write", "credit", "email"],
  handler: async ({ request }) => {
    const cronSecret = process.env.CRON_SECRET;
    const headerSecret = request.headers.get("x-cron-secret");
    if (!cronSecret || headerSecret !== cronSecret) {
      return routeData({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : undefined;

    if (!workspaceId) {
      // Fan out across all workspaces; per-workspace failures are reported in
      // the body, not as a 500.
      try {
        const summary = await runCronWorkspaceFanout({
          job: "number_rental_billing",
          run: (id) => runNumberRentalBilling({ workspaceId: id }),
        });
        return routeData(summary);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("Number rental billing sweep failed", { error: message });
        return routeData({ error: message }, { status: 500 });
      }
    }

    try {
      const result = await runNumberRentalBilling({ workspaceId });
      return routeData(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Number rental billing sweep failed", { workspaceId, error: message });
      return routeData({ error: message }, { status: 500 });
    }
  },
});
