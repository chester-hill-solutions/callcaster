import { getWorkspaceRouteContext } from "@/lib/workspace-route.server";
import { CardAction } from "twilio/lib/rest/content/v1/content";
import { data as routeData } from "react-router";
import { Flags } from "@/lib/types";
import { handleNewCampaign } from "@/lib/workspace-selector/WorkspaceSelectedNewUtils.server";
import type { ActionFunctionArgs } from "react-router";

export async function action({ request, params, context }: ActionFunctionArgs) {

  const { headers, user, workspaceId, userRole } = getWorkspaceRouteContext(context);

  if (workspaceId == null) {
    return routeData(
      {
        audienceData: null,
        campaignAudienceData: null,
        error: "Workspace not found",
      },
      { headers },
    );
  }

  const formData = await request.formData();
  const formAction = formData.get("formAction") as string;

  switch (formAction) {
    case "newCampaign": {
      return handleNewCampaign({
        formData,
        workspaceId,
        headers,
      });
    }
    default:
      break;
  }

  return routeData({ error: "Form Action not recognized" }, { headers });
}
