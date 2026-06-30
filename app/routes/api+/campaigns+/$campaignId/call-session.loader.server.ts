import { requireJsonAuth,
} from "@/lib/api-auth.server";
import { createErrorResponse } from "@/lib/errors.server";
import { getCampaignCallSessionApi } from "@/lib/platform-telephony.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const campaignId = params.campaignId;
  if (!campaignId) {
    return jsonError("campaignId is required", 400);
  }

  try {
    const result = await getCampaignCallSessionApi(      auth.user.id,
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
}
