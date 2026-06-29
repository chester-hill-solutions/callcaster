import {
  Audience,
  Campaign,
  IVRCampaign,
  LiveCampaign,
  MessageCampaign,
  Schedule,
  WorkspaceData,
  WorkspaceNumbers,
} from "@/lib/types";
import { data as routeData, redirect } from "react-router";
import { fetchBasicResults, fetchCampaignData, fetchCampaignDetails, fetchQueueCounts, getUserRole, getWorkspaceUsers } from "@/lib/database.server";
import { logger as  loggerServer } from "@/lib/logger.server";
import { MemberRole } from "@/lib/member-role";
import { SupabaseClient } from "@supabase/supabase-js";
import { verifyAuth } from "@/lib/supabase.server";
import type { ActionFunctionArgs } from "react-router";
import type { LoaderFunctionArgs } from "react-router";

type CampaignTable =
  | "live_campaign"
  | "message_campaign"
  | "ivr_campaign";

const getTable = (
  campaignType: string | null | undefined,
): CampaignTable | null => {
  return campaignType === "live_call"
    ? "live_campaign"
    : campaignType === "message"
      ? "message_campaign"
      : campaignType &&
          ["robocall", "simple_ivr", "complex_ivr"].includes(campaignType)
        ? "ivr_campaign"
        : null;
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {

  const { id: workspace_id, selected_id } = params;
  if (!workspace_id || !selected_id) {
    return redirect(`/workspaces/${workspace_id}/campaigns`);
  }
  const { supabaseClient, user } = await verifyAuth(request);

  const [campaignType, queueCounts, workspace, userRole] = await Promise.all([
    supabaseClient
      .from("campaign")
      .select("type")
      .eq("id", Number(selected_id))
      .single(),
    fetchQueueCounts(supabaseClient, selected_id),
    fetchCampaignData(supabaseClient, selected_id),
    getUserRole({ supabaseClient, user, workspaceId: workspace_id }),
  ]);
  if (!campaignType || !campaignType.data) {
    return redirect(`/workspaces/${workspace_id}/campaigns`);
  }
  if (workspace.error) throw workspace.error;

  const campaignTable = getTable(campaignType.data.type);
  if (!campaignTable) {
    return redirect(`/workspaces/${workspace_id}/campaigns`);
  }

  const campaignDetails = await fetchCampaignDetails(
    supabaseClient,
    selected_id,
    workspace_id,
    campaignTable,
  );

  const resultsPromise = fetchBasicResults(
    supabaseClient,
    selected_id,
  ) as unknown as {
    disposition: string;
    count: number;
    average_call_duration: string;
    average_wait_time: string;
    expected_total: number;
  }[];

  return routeData({
    selected_id,
    hasAccess: [MemberRole.Owner, MemberRole.Admin].includes(
      userRole?.role as MemberRole,
    ),
    campaignDetails,
    user: user,
    results: resultsPromise || [], // Deferred loading
    queueCounts,
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {

  const { supabaseClient, user } = await verifyAuth(request);
  const rpcClient = supabaseClient as SupabaseClient<any>;
  const { id: workspace_id, selected_id: campaign_id } = params;
  if (!workspace_id || !campaign_id) {
    return redirect(`/workspaces/${workspace_id}/campaigns`);
  }
  const { data: users } = await getWorkspaceUsers({
    supabaseClient,
    workspaceId: workspace_id,
  });
  const campaignType = await supabaseClient
    .from("campaign")
    .select("type")
    .eq("id", Number(campaign_id))
    .single();
  if (!campaignType || !campaignType.data) {
    return redirect(`/workspaces/${workspace_id}/campaigns`);
  }
  if (campaignType.data.type === "message") {
    const { data, error } = await rpcClient
      .rpc("get_campaign_messages", {
        prop_campaign_id: Number(campaign_id),
        prop_workspace_id: workspace_id,
      })
      .csv();
    if (error || !data) {
      loggerServer.error("Error fetching campaign messages:", error);
      return routeData(
        { error: error?.message || "Error fetching campaign messages" },
        { status: 500 },
      );
    }
    return routeData({
      csvContent: data,
      filename: `outreach_results_${campaign_id}.csv`,
    });
  } else if (
    campaignType.data.type === "live_call" ||
    campaignType.data.type === "robocall"
  ) {
    const { data, error } = await rpcClient
      .rpc("get_campaign_attempts", {
        p_campaign_id: Number(campaign_id),
      })
      .csv();
    if (error || !data) {
      loggerServer.error("Error fetching campaign attempts:", error);
      return routeData(
        { error: error?.message || "Error fetching campaign attempts" },
        { status: 500 },
      );
    }
    return routeData({
      csvContent: data,
      filename: `outreach_results_${campaign_id}.csv`,
    });
  } else {
    return routeData({ error: "Invalid campaign type" }, { status: 400 });
  }
}
