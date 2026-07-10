import { getWorkspaceRouteContext } from "@/lib/workspace-route.server";
import { data as routeData } from "react-router";
import { findCampaignInWorkspace } from "@/lib/campaign-ivr.server";
import { getWorkspaceById } from "@/lib/workspace-members-db.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params, context, url}: LoaderFunctionArgs) {

  const { headers, user, workspaceId, userRole } = getWorkspaceRouteContext(context);
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
  const workspaceData = await getWorkspaceById(workspaceId);
  if (!workspaceData) {
    return routeData({ workspace: null, error: "Workspace not found" }, { headers, status: 404 });
  }

  return routeData(
    { workspace: workspaceData, error: null, ref: ref || null, campaignType },
    { headers },
  );
}
