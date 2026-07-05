import { getSession } from "@/lib/auth.server";
import { createCampaign, deleteCampaign, parseActionRequest, requireWorkspaceAccess, updateCampaign } from "@/lib/database.server";
import { createErrorResponse } from "@/lib/errors.server";
import { data as routeData } from "react-router";
import { parseJsonField } from "@/lib/parse-utils.server";
import { getDualAuthUser, requireDualAuth } from "@/lib/api-auth.server";
import { resolveCampaignWorkspaceId } from "@/lib/platform-telephony.server";


export const action = async ({ request }: { request: Request }) => {

  const auth = await requireDualAuth(request);
  if (auth instanceof Response) return auth;
  const { headers } = await getSession(request);
  const user = getDualAuthUser(auth);
  if (!user) {
    return routeData({ error: "Unauthorized" }, { status: 401, headers });
  }
  try {
    const data = await parseActionRequest(request);

    if (request.method === "PATCH") {
      const campaignData = parseJsonField<Parameters<typeof updateCampaign>[0]["campaignData"]>(data.campaignData);
      const campaignDetails = parseJsonField<Parameters<typeof updateCampaign>[0]["campaignDetails"]>(data.campaignDetails);
      const campaignId = String(campaignData.campaign_id ?? campaignData.id ?? "");
      if (!campaignId) {
        return routeData({ error: "Campaign ID is required" }, { status: 400, headers });
      }
      const workspaceId = await resolveCampaignWorkspaceId(campaignId);
      if (!workspaceId) {
        return routeData({ error: "Campaign not found" }, { status: 404, headers });
      }
      await requireWorkspaceAccess({ user, workspaceId });
      const { campaign, campaignDetails: updatedCampaignDetails } =
        await updateCampaign({ campaignData, campaignDetails });
      return routeData({ campaign, campaignDetails: updatedCampaignDetails }, { headers });
    }

    if (request.method === "DELETE") {
      const campaignId = String(data.campaignId ?? "");
      const workspaceId = String(data.workspaceId ?? data.workspace ?? "");
      if (!workspaceId) {
        return routeData({ error: "Workspace ID is required" }, { status: 400, headers });
      }
      await requireWorkspaceAccess({ user, workspaceId });
      await deleteCampaign({ workspaceId, campaignId });
      return routeData({ success: true }, { headers });
    }

    if (request.method === "POST") {
      const campaignData = parseJsonField<Parameters<typeof createCampaign>[0]["campaignData"]>(data.campaignData);
      const workspaceId = String(campaignData.workspace ?? "");
      if (!workspaceId) {
        return routeData({ error: "Workspace ID is required" }, { status: 400, headers });
      }
      await requireWorkspaceAccess({ user, workspaceId });
      const { campaign, campaignDetails: createdCampaignDetails } = await createCampaign({
        campaignData,
      });
      return routeData({ campaign, campaignDetails: createdCampaignDetails }, { headers });
    }

    return routeData({ error: "Method not allowed" }, { status: 405, headers });
  } catch (error) {
    return createErrorResponse(error, "Failed to process campaign request", 400, { headers });
  }
}
