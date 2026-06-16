import { data as routeData } from "react-router";
import { handleNewAudience } from "@/lib/workspace-selector/WorkspaceSelectedNewUtils.server";
import { verifyAuth } from "@/lib/supabase.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {

  const { supabaseClient, headers, user } = await verifyAuth(request);

  const workspaceId = params.id;
  const campaignId = params.campaign_id;

  if (workspaceId == null || campaignId == null) {
    return routeData(
      {
        campaign: null,
        error:
          workspaceId == null ? "Workspace not found" : "Campaign not found",
      },
      { headers },
    );
  }

  const { data: campaignData, error: campaignError } = await supabaseClient
    .from("campaign")
    .select()
    .eq("id", parseInt(campaignId))
    .eq("workspace", workspaceId)
    .single();

  if (campaignError) {
    return routeData({ campaign: null, error: campaignError }, { headers });
  }

  return routeData({ campaign: campaignData, error: null }, { headers });
}
