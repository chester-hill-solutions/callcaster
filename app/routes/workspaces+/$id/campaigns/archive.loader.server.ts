import { data as routeData } from "react-router";
import { listArchivedCampaignsInWorkspace } from "@/lib/campaign-ivr.server";
import { logger } from "@/lib/logger.server";
import { requireWorkspaceLoaderContext } from "@/lib/workspace-route.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {

  const result = await requireWorkspaceLoaderContext(request, params.id);
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
}
