import { data as routeData } from "react-router";
import { listArchivedCampaignsInWorkspace } from "@/lib/campaign-ivr.server";
import { logger } from "@/lib/logger.server";
import { workspaceLoaderAuth } from "@/lib/workspace-route.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: workspaceLoaderAuth,
  sideEffects: ["db-read"],
  handler: async ({ auth: result }) => {
    if (!result.ok) return result.response;
    const { headers, workspaceId } = result.ctx;

    try {
      const archivedCampaigns = await listArchivedCampaignsInWorkspace(workspaceId);
      return routeData(
        { archivedCampaigns },
        { headers },
      );
    } catch (error) {
      logger.error("Error fetching archived campaigns:", error);
      return routeData(
        { archivedCampaigns: [] },
        { headers },
      );
    }
  },
});
