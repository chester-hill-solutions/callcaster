import { hasMinRole, workspaceRouteAuth } from "@/lib/workspace-route.server";
import { data as routeData, redirect } from "react-router";
import {
  createEmptyAudience,
  findCampaignForAudienceUpload,
  linkAudienceToCampaign,
} from "@/lib/audience-upload-db.server";
import { defineAction } from "@/lib/handler.server";
import { MemberRole } from "@/lib/member-role";
import { validatePeopleReturnPath } from "@/lib/people-return-path";

export const action = defineAction({
  auth: workspaceRouteAuth,
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {
    const { headers, user, workspaceId, userRole } = auth;
    if (workspaceId == null) {
      return routeData(
        {
          success: false,
          error: "Workspace not found",
        },
        { headers },
      );
    }

    if (!hasMinRole(userRole, MemberRole.Member)) {
      return routeData(
        { success: false, error: "You don't have permission to perform this action" },
        { headers, status: 403 },
      );
    }

    const formData = await request.formData();
    const formAction = formData.get("formAction") as string;
    const audienceName = formData.get("audience-name") as string;
    const campaignIdRaw = formData.get("campaign-id");
    const returnTo = validatePeopleReturnPath(
      formData.get("return-to")?.toString(),
      workspaceId,
    );

    if (!audienceName) {
      return routeData(
        {
          success: false,
          error: "Call list name is required",
        },
        { headers },
      );
    }

    switch (formAction) {
      case "createAudience": {
        const campaignId =
          campaignIdRaw == null
            ? null
            : Number.parseInt(String(campaignIdRaw), 10);
        if (campaignId != null) {
          if (!Number.isSafeInteger(campaignId)) {
            return routeData(
              { success: false, error: "Campaign ID is invalid" },
              { status: 400, headers },
            );
          }
          if (!(await findCampaignForAudienceUpload(workspaceId, campaignId))) {
            return routeData(
              { success: false, error: "Campaign not found" },
              { status: 404, headers },
            );
          }
        }

        let audienceData;
        try {
          audienceData = await createEmptyAudience(workspaceId, audienceName);
        } catch (error) {
          return routeData(
            {
              success: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Call list creation failed",
            },
            { headers },
          );
        }

        if (!audienceData) {
          return routeData(
            {
              success: false,
              error: "Call list creation failed",
            },
            { headers },
          );
        }

        if (campaignId != null) {
          const linked = await linkAudienceToCampaign({
            workspaceId,
            campaignId,
            audienceId: audienceData.id,
          });
          if (!linked) {
            return routeData(
              { success: false, error: "Campaign not found" },
              { status: 404, headers },
            );
          }
        }

        return redirect(
          returnTo ?? `/workspaces/${workspaceId}/audiences/${audienceData.id}`,
          { headers },
        );
      }
      default:
        break;
    }

    return routeData({ success: false, error: "Form Action not recognized" }, { headers });
  },
});
