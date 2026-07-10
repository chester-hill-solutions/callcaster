import { getWorkspaceRouteContext } from "@/lib/workspace-route.server";
import { data as routeData } from "react-router";
import { handleNewAudience } from "@/lib/workspace-selector/WorkspaceSelectedNewUtils.server";
import type { ActionFunctionArgs } from "react-router";

export async function action({ request, params, context }: ActionFunctionArgs) {

  const { headers, user, workspaceId, userRole } = getWorkspaceRouteContext(context);
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

  const formData = await request.formData();
  const formAction = formData.get("formAction") as string;
  const contactsFile = formData.get("contacts") as File;

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
        contactsFile,
        campaignId,
        userId: user.id,
      });
    }
    default:
      break;
  }

  return routeData({ error: "Form Action not recognized" }, { headers });
}
