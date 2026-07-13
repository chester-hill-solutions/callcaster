import { data as routeData } from "react-router";
import { getWorkspaceBilling } from "@/lib/platform-billing.server";
import { workspaceLoaderAuth } from "@/lib/workspace-route.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: workspaceLoaderAuth,
  sideEffects: ["db-read"],
  handler: async ({ auth: result }) => {
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
  },
});
