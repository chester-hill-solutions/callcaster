import { data as routeData } from "react-router";
import { getWorkspaceBilling } from "@/lib/platform-billing.server";
import { verifyAuth } from "@/lib/supabase.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, user } = await verifyAuth(request);

  const workspaceId = params.id;
  if (!workspaceId) {
    throw new Error("Workspace ID is required");
  }

  const billing = await getWorkspaceBilling(supabaseClient, user.id, workspaceId);
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
