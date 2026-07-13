import { workspaceRouteAuth } from "@/lib/workspace-route.server";
import { data as routeData, redirect } from "react-router";
import { createBillingCheckoutSession } from "@/lib/platform-billing.server";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  auth: workspaceRouteAuth,
  sideEffects: ["db-write", "external"],
  handler: async ({ request, params, url, auth }) => {
    const { user } = auth;
    const workspaceId = params.id;
    if (!workspaceId) throw new Error("Workspace ID is required");

    const formData = await request.formData();
    const amount = Math.floor(Number(formData.get("amount")));

    const result = await createBillingCheckoutSession({
      userId: user.id,
      workspaceId,
      amount,
      requestUrl: url.href,
    });

    if (!result.ok) {
      return routeData({ error: result.error }, { status: result.status });
    }

    return redirect(result.checkout_url);
  },
});
