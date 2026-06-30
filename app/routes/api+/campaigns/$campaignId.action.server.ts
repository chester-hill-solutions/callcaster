import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  authForCampaign,
  duplicateCampaignApi,
  getCampaignDetailApi,
  transitionCampaignStatusApi,
} from "@/lib/platform-data.server";
import { campaignStatusBodySchema } from "@/lib/schemas/api/platform-data";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const campaignId = params.campaignId;
  if (!campaignId) {
    return jsonError("campaignId is required", 400);
  }

  const auth = await authForCampaign(request, campaignId);
  if (auth instanceof Response) return auth;

  const result = await getCampaignDetailApi(
    auth.client,
    campaignId,
    auth.workspaceId,
  );
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse({ campaign: result.campaign }, 200);
}

export async function action({ request, params }: ActionFunctionArgs) {
  const campaignId = params.campaignId;
  if (!campaignId) {
    return jsonError("campaignId is required", 400);
  }

  const auth = await authForCampaign(request, campaignId);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const operation = url.searchParams.get("operation");

  if (request.method === "POST" && operation === "duplicate") {
    const result = await duplicateCampaignApi(
      auth.client,
      campaignId,
      auth.workspaceId,
    );
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }
    return jsonResponse({ campaign_id: result.campaign_id }, 201);
  }

  if (request.method === "POST" && operation === "status") {
    const parsed = await parseJsonBodyOrResponse(request, campaignStatusBodySchema);
    if (parsed instanceof Response) return parsed;

    const result = await transitionCampaignStatusApi(
      auth.client,
      campaignId,
      auth.workspaceId,
      parsed,
    );
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }
    return jsonResponse(
      { success: true, status: result.status, is_active: result.is_active },
      200,
    );
  }

  return jsonError("Method not allowed", 405);
}
