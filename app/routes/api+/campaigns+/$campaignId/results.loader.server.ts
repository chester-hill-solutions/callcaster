import { requireJsonAuth } from "@/lib/api-auth.server";
import { createErrorResponse } from "@/lib/errors.server";
import { defineLoader } from "@/lib/handler.server";
import { getCampaignResultsApi } from "@/lib/platform-analytics.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";

export const loader = defineLoader({
  auth: ({ request }) => requireJsonAuth(request),
  sideEffects: ["db-read"],
  handler: async ({ params, auth }) => {
    const campaignId = params.campaignId;
    if (!campaignId) {
      return jsonError("campaignId is required", 400);
    }

    try {
      const result = await getCampaignResultsApi(
        auth.user.id,
        campaignId,
      );

      if (!result.ok) {
        return jsonError(result.error, result.status);
      }

      return jsonResponse(
        {
          campaign: result.campaign,
          results: result.results,
          queue_counts: result.queue_counts,
        },
        200,
      );
    } catch (error) {
      return createErrorResponse(error, "Failed to load campaign results");
    }
  },
});
