import { data as routeData } from "react-router";
import { runNumberRentalBilling } from "@/lib/number-rental-billing.server";
import { logger } from "@/lib/logger.server";
import type { ActionFunctionArgs } from "react-router";

/**
 * HTTP endpoint for the number-rental-billing daily sweep.
 * Called by pg_cron via `net.http_post` (no Authorization header).
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  // Basic cron secret validation if configured
  const cronSecret = process.env.NUMBER_RENTAL_CRON_SECRET;
  if (cronSecret) {
    const headerSecret = request.headers.get("x-cron-secret");
    if (headerSecret !== cronSecret) {
      return routeData({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : undefined;

  try {
    const result = await runNumberRentalBilling({ workspaceId });
    return routeData(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Number rental billing sweep failed", { workspaceId, error: message });
    return routeData({ error: message }, { status: 500 });
  }
};
