import { data as routeData, redirect } from "react-router";
import {
  rpcGetCampaignAttemptsCsv,
  rpcGetCampaignMessagesCsv,
} from "@/lib/db-rpc.server";
import { getWorkspaceUsers } from "@/lib/database/workspace.server";
import { findCampaignInWorkspace } from "@/lib/campaign-ivr.server";
import { logger as loggerServer } from "@/lib/logger.server";
import { workspaceRouteAuth } from "@/lib/workspace-route.server";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  auth: workspaceRouteAuth,
  sideEffects: ["db-read"],
  handler: async ({ params, auth }) => {
    const { workspaceId: workspace_id } = auth;
    const campaign_id = params.selected_id;
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
  },
});
