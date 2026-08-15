import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { dataPlaneCapabilityAuthForResource } from "@/lib/capability-guard.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { defineAction, defineLoader } from "@/lib/handler.server";
import {
  duplicateCampaignApi,
  getCampaignDetailApi,
  transitionCampaignStatusApi,
} from "@/lib/platform-data.server";
import { campaignStatusBodySchema } from "@/lib/schemas/api/platform-data";

export const loader = defineLoader({
  auth: dataPlaneCapabilityAuthForResource("campaigns.read", "campaign", "campaignId"),
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    const result = await getCampaignDetailApi(
      auth.campaignId,
      auth.workspaceId,
    );
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse({ campaign: result.campaign }, 200);
  },
});

export const action = defineAction({
  // Both branches below (duplicate, status transition) are destructive
  // mutations: require at least `member`, blocking the `caller` role.
  auth: dataPlaneCapabilityAuthForResource("campaigns.write", "campaign", "campaignId", {
    minRole: "member",
  }),
  sideEffects: ["db-write"],
  handler: async ({ request, url, auth }) => {
    const operation = url.searchParams.get("operation");

    if (request.method === "POST" && operation === "duplicate") {
      const result = await duplicateCampaignApi(
        auth.campaignId,
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
        auth.campaignId,
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
  },
});
