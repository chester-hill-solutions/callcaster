import { getWorkspaceRouteContext } from "@/lib/workspace-route.server";
import { data as routeData, redirect } from "react-router";
import { createBillingCheckoutSession } from "@/lib/platform-billing.server";
import type { ActionFunctionArgs } from "react-router";

export async function action({ request, params, context }: ActionFunctionArgs) {
  const { user } = getWorkspaceRouteContext(context)
  const workspaceId = params.id;
  if (!workspaceId) throw new Error("Workspace ID is required");

  const formData = await request.formData();
  const amount = Math.floor(Number(formData.get("amount")));

  const result = await createBillingCheckoutSession({
    userId: user.id,
    workspaceId,
    amount,
    requestUrl: request.url,
  });

  if (!result.ok) {
    return routeData({ error: result.error }, { status: result.status });
  }

  return redirect(result.checkout_url);
}
