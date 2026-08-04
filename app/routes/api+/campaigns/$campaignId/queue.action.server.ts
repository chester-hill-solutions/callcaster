import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { requireDataPlaneCapability } from "@/lib/capability-guard.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { defineAction, defineLoader } from "@/lib/handler.server";
import {
  fetchCampaignQueueItemWithContact,
  mapCampaignQueueItemForUi,
} from "@/lib/campaign-queue-search.server";
import {
  authForResource,
  getCampaignQueueApi,
  patchCampaignQueueApi,
} from "@/lib/platform-data.server";
import { patchCampaignQueueBodySchema } from "@/lib/schemas/api/platform-data";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

export const loader = defineLoader({
  auth: async ({ request, params }: LoaderFunctionArgs) => {
    const campaignId = params.campaignId;
    if (!campaignId) {
      return jsonError("campaignId is required", 400);
    }

    const auth = await authForResource(request, "campaign", campaignId);
    if (auth instanceof Response) return auth;

    const capability = await requireDataPlaneCapability(auth, "campaigns.read");
    if (capability instanceof Response) return capability;

    return { ...auth, campaignId };
  },
  sideEffects: ["db-read"],
  handler: async ({ request, url, auth }) => {
    const campaignId = auth.campaignId;
    const queueIdParam = url.searchParams.get("queue_id");
    if (queueIdParam) {
      const queueId = Number.parseInt(queueIdParam, 10);
      if (Number.isNaN(queueId)) {
        return jsonError("Invalid queue_id", 400);
      }

      try {
        const item = await fetchCampaignQueueItemWithContact({
          campaignId: Number(campaignId),
          queueId,
        });
        return jsonResponse(
          { item: item ? mapCampaignQueueItemForUi(item) : null },
          200,
        );
      } catch (error) {
        return jsonError(
          error instanceof Error ? error.message : "Failed to load queue item",
          500,
        );
      }
    }

    const result = await getCampaignQueueApi(
      request,
      campaignId,
      auth.workspaceId,
      url.searchParams,
    );
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse(result.queue, 200);
  },
});

export const action = defineAction({
  auth: async ({ request, params }: ActionFunctionArgs) => {
    const campaignId = params.campaignId;
    if (!campaignId) {
      return jsonError("campaignId is required", 400);
    }

    if (request.method !== "PATCH") {
      return jsonError("Method not allowed", 405);
    }

    // Destructive mutation: require at least `member`, blocking the `caller` role.
    const auth = await authForResource(request, "campaign", campaignId, "member");
    if (auth instanceof Response) return auth;

    const capability = await requireDataPlaneCapability(auth, "campaigns.write");
    if (capability instanceof Response) return capability;

    return { ...auth, campaignId };
  },
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {
    const parsed = await parseJsonBodyOrResponse(request, patchCampaignQueueBodySchema);
    if (parsed instanceof Response) return parsed;

    const result = await patchCampaignQueueApi(
      auth.campaignId,
      auth.workspaceId,
      parsed,
    );
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse({ success: true }, 200);
  },
});
