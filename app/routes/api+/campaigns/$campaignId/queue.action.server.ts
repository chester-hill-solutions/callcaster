import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  authForCampaign,
  getCampaignQueueApi,
  patchCampaignQueueApi,
} from "@/lib/platform-data.server";
import { patchCampaignQueueBodySchema } from "@/lib/schemas/api/platform-data";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const campaignId = params.campaignId;
  if (!campaignId) {
    return jsonError("campaignId is required", 400);
  }

  const auth = await authForCampaign(request, campaignId);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const result = await getCampaignQueueApi(
    auth.supabase,
    campaignId,
    auth.workspaceId,
    url.searchParams,
  );
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse(result.queue, 200);
}

export async function action({ request, params }: ActionFunctionArgs) {
  const campaignId = params.campaignId;
  if (!campaignId) {
    return jsonError("campaignId is required", 400);
  }

  if (request.method !== "PATCH") {
    return jsonError("Method not allowed", 405);
  }

  const auth = await authForCampaign(request, campaignId);
  if (auth instanceof Response) return auth;

  const parsed = await parseJsonBodyOrResponse(request, patchCampaignQueueBodySchema);
  if (parsed instanceof Response) return parsed;

  const result = await patchCampaignQueueApi(
    auth.supabase,
    campaignId,
    auth.workspaceId,
    parsed,
  );
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse({ success: true }, 200);
}
