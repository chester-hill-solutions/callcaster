import {
  IVRCampaign,
  LiveCampaign,
  MessageCampaign,
} from "@/lib/types";
import { data as routeData, redirect } from "react-router";
import {
  rpcGetCampaignAttemptsCsv,
  rpcGetCampaignMessagesCsv,
} from "@/lib/db-rpc.server";
import { fetchBasicResults, fetchCampaignDetails, fetchQueueCounts, getUserRole, getWorkspaceUsers } from "@/lib/database.server";
import { findCampaignInWorkspace } from "@/lib/campaign-ivr.server";
import { logger as loggerServer } from "@/lib/logger.server";
import { MemberRole } from "@/lib/member-role";
import { verifyAuth } from "@/lib/auth.server";
import type { ActionFunctionArgs } from "react-router";
import type { LoaderFunctionArgs } from "react-router";

const VALID_CAMPAIGN_TYPES = new Set([
  "live_call",
  "message",
  "robocall",
  "simple_ivr",
  "complex_ivr",
]);

export const loader = async ({ request, params }: LoaderFunctionArgs) => {

  const { id: workspace_id, selected_id } = params;
  if (!workspace_id || !selected_id) {
    return redirect(`/workspaces/${workspace_id}/campaigns`);
  }
  const { user } = await verifyAuth(request);

  const [campaignRow, queueCounts, userRole] = await Promise.all([
    findCampaignInWorkspace(workspace_id, selected_id),
    fetchQueueCounts({ workspaceId: workspace_id, campaignId: selected_id}),
    getUserRole({ user, workspaceId: workspace_id }),
  ]);
  if (!campaignRow?.type || !VALID_CAMPAIGN_TYPES.has(campaignRow.type)) {
    return redirect(`/workspaces/${workspace_id}/campaigns`);
  }

  const campaignDetails = await fetchCampaignDetails({
    workspaceId: workspace_id,
    campaignId: selected_id,
  });

  const resultsPromise = fetchBasicResults({
    workspaceId: workspace_id,
    campaignId: selected_id,
  }) as unknown as {
    disposition: string;
    count: number;
    average_call_duration: string;
    average_wait_time: string;
    expected_total: number;
  }[];

  return routeData({
    selected_id,
    hasAccess: [MemberRole.Owner, MemberRole.Admin].includes(
      userRole?.role as MemberRole,
    ),
    campaignDetails,
    user: user,
    results: resultsPromise || [], // Deferred loading
    queueCounts,
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {

  await verifyAuth(request);
  const { id: workspace_id, selected_id: campaign_id } = params;
  if (!workspace_id || !campaign_id) {
    return redirect(`/workspaces/${workspace_id}/campaigns`);
  }
  await getWorkspaceUsers({
    workspaceId: workspace_id,
  });
  const campaignRow = await findCampaignInWorkspace(workspace_id, campaign_id);
  if (!campaignRow?.type) {
    return redirect(`/workspaces/${workspace_id}/campaigns`);
  }
  if (campaignRow.type === "message") {
    try {
      const csvContent = await rpcGetCampaignMessagesCsv(
        workspace_id,
        Number(campaign_id),
      );
      return routeData({
        csvContent,
        filename: `outreach_results_${campaign_id}.csv`,
      });
    } catch (error) {
      loggerServer.error("Error fetching campaign messages:", error);
      return routeData(
        {
          error:
            error instanceof Error
              ? error.message
              : "Error fetching campaign messages",
        },
        { status: 500 },
      );
    }
  } else if (
    campaignRow.type === "live_call" ||
    campaignRow.type === "robocall"
  ) {
    try {
      const csvContent = await rpcGetCampaignAttemptsCsv(Number(campaign_id));
      return routeData({
        csvContent,
        filename: `outreach_results_${campaign_id}.csv`,
      });
    } catch (error) {
      loggerServer.error("Error fetching campaign attempts:", error);
      return routeData(
        {
          error:
            error instanceof Error
              ? error.message
              : "Error fetching campaign attempts",
        },
        { status: 500 },
      );
    }
  } else {
    return routeData({ error: "Invalid campaign type" }, { status: 400 });
  }
}
