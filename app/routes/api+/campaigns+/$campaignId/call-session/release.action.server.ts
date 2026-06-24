import {
  getAuthSupabaseClient,
  requireJsonAuth,
} from "@/lib/api-auth.server";
import { createErrorResponse } from "@/lib/errors.server";
import { releaseCampaignCallSessionApi } from "@/lib/platform-telephony.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import type { ActionFunctionArgs } from "react-router";

export async function action({ request, params }: ActionFunctionArgs) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const campaignId = params.campaignId;
  if (!campaignId) {
    return jsonError("campaignId is required", 400);
  }

  try {
    const result = await releaseCampaignCallSessionApi(
      getAuthSupabaseClient(auth),
      auth.user.id,
      campaignId,
    );

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse({ released: result.released }, 200);
  } catch (error) {
    return createErrorResponse(error, "Failed to release call session");
  }
}
