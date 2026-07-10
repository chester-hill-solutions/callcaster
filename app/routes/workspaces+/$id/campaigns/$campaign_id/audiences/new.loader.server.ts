import { getWorkspaceRouteContext } from "@/lib/workspace-route.server";
import { data as routeData } from "react-router";
import { findCampaignInWorkspace } from "@/lib/campaign-ivr.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params, context }: LoaderFunctionArgs) {

  const { headers, user, workspaceId } = getWorkspaceRouteContext(context);  const campaignId = params.campaign_id;

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
}
