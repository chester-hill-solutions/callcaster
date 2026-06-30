import { requireJsonAuth,
} from "@/lib/api-auth.server";
import { requireWorkspaceAccess } from "@/lib/database.server";
import { createErrorResponse } from "@/lib/errors.server";
import {
  resolveCampaignWorkspaceId,
} from "@/lib/platform-telephony.server";
import { fetchCampaignQueueRowsByIds } from "@/lib/campaign-queue-db.server";
import { rpcSelectAndUpdateCampaignContacts } from "@/lib/db-rpc.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { data as routeData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;  const url = new URL(request.url);
  const campaignId = url.searchParams.get("campaign_id");
  const workspaceIdParam = url.searchParams.get("workspace_id");
  const limit = url.searchParams.get("limit") ?? "10";

  if (!campaignId) {
    return jsonError("campaign_id is required", 400);
  }

  try {
    const campaignWorkspace = await resolveCampaignWorkspaceId(client, campaignId);
    if (!campaignWorkspace) {
      return jsonError("Campaign not found", 404);
    }

    if (workspaceIdParam && workspaceIdParam !== campaignWorkspace) {
      return jsonError("workspace_id does not match campaign", 403);
    }

    await requireWorkspaceAccess({ user: auth.user,
      workspaceId: campaignWorkspace,
    });

    if (parseInt(limit, 10) === 0) {
      return jsonResponse([], 200);
    }

    const newQueue = await rpcSelectAndUpdateCampaignContacts(auth.user.id, {
      campaignId: Number(campaignId),
      limit: parseInt(limit, 10),
    });

    if (!newQueue || !newQueue.length) {
      return jsonResponse([], 200);
    }

    const queueItems = await fetchCampaignQueueRowsByIds(
      newQueue.map((item: { queue_id: number }) => item.queue_id),
    );

    return routeData(queueItems);
  } catch (error) {
    return createErrorResponse(error, "Failed to load queue");
  }
};
