import { hasMinRole, workspaceRouteAuth } from "@/lib/workspace-route.server";
import { data as routeData } from "react-router";
import { handleNewAudience } from "@/lib/workspace-selector/WorkspaceSelectedNewUtils.server";
import { defineAction } from "@/lib/handler.server";
import { MemberRole } from "@/lib/member-role";

export const action = defineAction({
  auth: workspaceRouteAuth,
  sideEffects: ["db-write"],
  handler: async ({ request, params, auth }) => {
    const { headers, user, workspaceId, userRole } = auth;
    const campaignId = params.campaign_id;

    if (!(workspaceId && campaignId)) {
      return routeData(
        {
          audienceData: null,
          campaignAudienceData: null,
          error: !workspaceId ? "Workspace not found" : "Campaign not found",
        },
        { headers },
      );
    }

    if (!hasMinRole(userRole, MemberRole.Member)) {
      return routeData(
        { error: "You don't have permission to perform this action" },
        { headers, status: 403 },
      );
    }

    const formData = await request.formData();
    const formAction = formData.get("formAction") as string;

    if (!formData.get("audience-name")) {
      return routeData(
        {
          success: false,
          error: "Audience name is required",
        },
        { headers },
      );
    }
    switch (formAction) {
      case "newAudience": {
        return handleNewAudience({
          formData,
          workspaceId,
          headers,
          campaignId,
          userId: user.id,
        });
      }
      default:
        break;
    }

    return routeData({ error: "Form Action not recognized" }, { headers });
  },
});
