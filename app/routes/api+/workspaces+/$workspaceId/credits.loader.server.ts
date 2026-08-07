import { getWorkspaceCreditsBalance } from "@/lib/workspace-credits.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import { defineLoader } from "@/lib/handler.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = defineLoader({
  auth: ({ params, context }: LoaderFunctionArgs) => {
    const workspaceId = params.workspaceId;
    if (!workspaceId) {
      return jsonError("workspaceId is required", 400);
    }
    const { userId } = getDataPlaneRouteContext(context, workspaceId);
    if (!userId) {
      return jsonError("Unauthorized", 401);
    }

    return { userId, workspaceId };
  },
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    const balance = await getWorkspaceCreditsBalance(auth.workspaceId);

    if (balance === null) {
      return jsonError("Workspace not found", 404);
    }

    return jsonResponse({ credits: balance }, 200);
  },
});
