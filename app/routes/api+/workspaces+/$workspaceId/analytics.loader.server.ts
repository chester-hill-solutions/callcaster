import { createErrorResponse } from "@/lib/errors.server";
import { getWorkspaceAnalyticsApi } from "@/lib/platform-analytics.server";
import { jsonResponse } from "@/lib/platform-api.server";
import { dataPlaneSessionAuth } from "@/lib/capability-guard.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: dataPlaneSessionAuth(),
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
