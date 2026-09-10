import { data as routeData } from "react-router";
import { getWorkspaceBillingActivity } from "@/lib/billing-activity.server";
import { env, getStripeKeyMode } from "@/lib/env.server";
import { workspaceLoaderAuth } from "@/lib/workspace-route.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: workspaceLoaderAuth,
  sideEffects: ["db-read"],
  handler: async ({ auth: result, url }) => {
    if (!result.ok) return result.response;
    const { user, workspaceId } = result.ctx;

    const filterParam = url.searchParams.get("filter");
    const filter =
      filterParam === "purchases" || filterParam === "usage"
        ? filterParam
        : "all";

    const billing = await getWorkspaceBillingActivity(user.id, workspaceId, {
      page: Number(url.searchParams.get("page") ?? "1"),
      filter,
    });
    if (!billing.ok) {
      throw new Error(billing.error);
    }

    const stripeKeyMode = getStripeKeyMode(env.STRIPE_SECRET_KEY());

    return routeData({
      credits: {
        balance: billing.balance,
        history: billing.history,
        page: billing.page,
        pageSize: billing.pageSize,
        totalCount: billing.totalCount,
        totals: billing.totals,
        filter,
      },
      campaignNames: billing.campaignNames,
      stripeKeyMode,
    });
  },
});