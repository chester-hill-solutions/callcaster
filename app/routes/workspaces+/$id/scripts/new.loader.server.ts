import { workspaceRouteAuth } from "@/lib/workspace-route.server";
import { data as routeData } from "react-router";
import { findCampaignInWorkspace } from "@/lib/campaign-ivr.server";
import { getWorkspaceForClient } from "@/lib/workspace-client-projection.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: workspaceRouteAuth,
  sideEffects: ["db-read"],
  handler: async ({ url, auth }) => {
    const { headers, workspaceId } = auth;
    const search = new URLSearchParams(url.search);
    const ref = search.get("ref") || null;
    if (workspaceId == null) {
      return routeData(
        { workspace: null, error: "Workspace does not exist" },
        { headers },
      );
    }
    let campaignType;
    if (ref) {
      const campaign = await findCampaignInWorkspace(workspaceId, Number(ref) || 0);
      campaignType = campaign?.type;
    }
    const workspaceData = await getWorkspaceForClient(workspaceId);
    if (!workspaceData) {
      return routeData({ workspace: null, error: "Workspace not found" }, { headers, status: 404 });
    }

    return routeData(
      { workspace: workspaceData, error: null, ref: ref || null, campaignType },
      { headers },
    );
  },
});
