import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { dataPlaneCapabilityAuthForResource } from "@/lib/capability-guard.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { defineAction, defineLoader } from "@/lib/handler.server";
import {
  fetchCampaignQueueItemWithContact,
  mapCampaignQueueItemForUi,
} from "@/lib/campaign-queue-search.server";
import {
  getCampaignQueueApi,
  patchCampaignQueueApi,
} from "@/lib/platform-data.server";
import { patchCampaignQueueBodySchema } from "@/lib/schemas/api/platform-data";

export const loader = defineLoader({
  auth: dataPlaneCapabilityAuthForResource("campaigns.read", "campaign", "campaignId"),
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
  // Destructive mutation: require at least `member`, blocking the `caller` role.
  auth: dataPlaneCapabilityAuthForResource("campaigns.write", "campaign", "campaignId", {
    minRole: "member",
  }),
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {
    if (request.method !== "PATCH") {
      return jsonError("Method not allowed", 405);
    }

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
