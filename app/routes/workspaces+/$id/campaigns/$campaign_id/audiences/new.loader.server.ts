import { workspaceRouteAuth } from "@/lib/workspace-route.server";
import { data as routeData } from "react-router";
import { findCampaignInWorkspace } from "@/lib/campaign-ivr.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: workspaceRouteAuth,
  sideEffects: ["db-read"],
  handler: async ({ params, auth }) => {
    const { headers, user, workspaceId } = auth;
    const campaignId = params.campaign_id;

    if (workspaceId == null || campaignId == null) {
      return routeData(
        {
          campaign: null,
          error:
            workspaceId == null ? "Workspace not found" : "Campaign not found",
        },
        { headers },
      );
    }

    const campaignData = await findCampaignInWorkspace(workspaceId, parseInt(campaignId, 10));

    if (!campaignData) {
      return routeData({ campaign: null, error: "Campaign not found" }, { headers, status: 404 });
    }

    return routeData({ campaign: campaignData, error: null }, { headers });
  },
});
