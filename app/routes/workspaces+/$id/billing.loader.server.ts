import { data as routeData } from "react-router";
import { getWorkspaceBillingActivity } from "@/lib/billing-activity.server";
import { env, getStripeKeyMode } from "@/lib/env.server";
import { workspaceLoaderAuth } from "@/lib/workspace-route.server";
import { defineLoader } from "@/lib/handler.server";
import { hasMinRole, MemberRole } from "@/lib/member-role";

export const loader = defineLoader({
  auth: workspaceLoaderAuth,
  sideEffects: ["db-read"],
  handler: async ({ auth: result, url }) => {
    if (!result.ok) return result.response;
    const { user, workspaceId, userRole, headers } = result.ctx;

    if (!hasMinRole(userRole.role, MemberRole.Admin)) {
      throw new Response("You don't have permission to view billing.", {
        headers,
        status: 403,
      });
    }

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
        items: billing.items,
        page: billing.page,
        pageSize: billing.pageSize,
        totalCount: billing.totalCount,
        totals: billing.totals,
        filter,
      },
      stripeKeyMode,
    });
  },
});
