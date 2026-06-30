import { data as routeData } from "react-router";
import { findCampaignInWorkspace } from "@/lib/campaign-ivr.server";
import { verifyAuth } from "@/lib/auth.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {

  const { headers } = await verifyAuth(request);

  const workspaceId = params.id;
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
}
