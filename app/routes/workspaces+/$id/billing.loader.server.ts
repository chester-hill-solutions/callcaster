import { data as routeData } from "react-router";
import { getWorkspaceBilling } from "@/lib/platform-billing.server";
import { requireWorkspaceLoaderContext } from "@/lib/workspace-route.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const result = await requireWorkspaceLoaderContext(request, params.id, { context });
  if (!result.ok) return result.response;
  const { user, workspaceId } = result.ctx;

  const billing = await getWorkspaceBilling(user.id, workspaceId);
  if (!billing.ok) {
    throw new Error(billing.error);
  }

  return routeData({
    credits: {
      balance: billing.balance,
      history: billing.transactions,
    },
  });
}
