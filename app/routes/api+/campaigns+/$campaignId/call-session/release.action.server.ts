import { requireJsonAuth } from "@/lib/api-auth.server";
import { createErrorResponse } from "@/lib/errors.server";
import { releaseCampaignCallSessionApi } from "@/lib/platform-telephony.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  auth: async ({ request, params }) => {
    const auth = await requireJsonAuth(request);
    if (auth instanceof Response) return auth;

    if (request.method !== "POST") {
      return jsonError("Method not allowed", 405);
    }

    if (!params.campaignId) {
      return jsonError("campaignId is required", 400);
    }

    return auth;
  },
  sideEffects: ["db-write"],
  handler: async ({ params, auth }) => {
    const campaignId = params.campaignId!;

    try {
      const result = await releaseCampaignCallSessionApi(auth.user.id, campaignId);

      if (!result.ok) {
        return jsonError(result.error, result.status);
      }

      return jsonResponse({ released: result.released }, 200);
    } catch (error) {
      return createErrorResponse(error, "Failed to release call session");
    }
  },
});
