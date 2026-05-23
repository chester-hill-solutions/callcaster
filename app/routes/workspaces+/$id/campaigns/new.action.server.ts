import { data as routeData, ActionFunctionArgs, Form, Link, useActionData, useOutletContext } from "react-router";
import { CardAction } from "twilio/lib/rest/content/v1/content";
import { Flags } from "@/lib/types";
import { data as routeData } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";
import { handleNewCampaign } from "@/lib/workspace-selector/WorkspaceSelectedNewUtils.server";

export async function action({ request, params }: ActionFunctionArgs) {


  const { supabaseClient, headers, user } = await verifyAuth(request);

  const workspaceId = params.id;

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
        supabaseClient,
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
