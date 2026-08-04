import { requireJsonAuth } from "@/lib/api-auth.server";
import { createErrorResponse } from "@/lib/errors.server";
import { defineLoader } from "@/lib/handler.server";
import { getCampaignCallSessionApi } from "@/lib/platform-telephony.server";
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
      const result = await getCampaignCallSessionApi(
        auth.user.id,
        campaignId,
      );

      if (!result.ok) {
        return jsonError(result.error, result.status);
      }

      const { ok: _ok, ...payload } = result;
      return jsonResponse(payload, 200);
    } catch (error) {
      return createErrorResponse(error, "Failed to load call session");
    }
  },
});
