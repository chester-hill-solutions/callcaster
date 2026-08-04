import { createErrorResponse } from "@/lib/errors.server";
import { getWorkspaceAnalyticsApi } from "@/lib/platform-analytics.server";
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
  handler: async ({ auth, url }) => {
    try {
      const result = await getWorkspaceAnalyticsApi(
        auth.userId,
        auth.workspaceId,
        url.href,
      );

      return jsonResponse({ analytics: result.analytics }, 200);
    } catch (error) {
      return createErrorResponse(error, "Failed to load analytics");
    }
  },
});
