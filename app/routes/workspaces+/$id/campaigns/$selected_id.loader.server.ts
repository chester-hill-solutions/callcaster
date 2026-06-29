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
import { downloadCsv } from "@/lib/csvDownload";
import { fetchBasicResults, fetchCampaignData, fetchCampaignDetails, fetchQueueCounts, getUserRole, getWorkspaceUsers } from "@/lib/database.server";
import { getCampaignReadiness } from "@/lib/campaign-readiness";
import { logger as  loggerServer } from "@/lib/logger.server";
import { MemberRole } from "@/lib/member-role";
import { SupabaseClient } from "@supabase/supabase-js";
import { verifyAuth } from "@/lib/supabase.server";
import type { LoaderFunctionArgs } from "react-router";

type CampaignTable = "live_campaign" | "message_campaign" | "ivr_campaign";

/** Tables whose row changes affect dashboard queue + disposition counts from the loader. */

const CAMPAIGN_DASHBOARD_COUNT_TABLES = [
  "campaign_queue",
  "outreach_attempt",
  "call",
  "message",
] as const;

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

  const readiness = getCampaignReadiness(workspace, campaignDetails, {
    queueCount: queueCounts.queuedCount ?? queueCounts.fullCount,
  });
  const joinDisabled = readiness.startDisabledReason
    ? readiness.startDisabledReason
    : workspace?.status === "scheduled"
      ? "Campaign scheduled."
      : !workspace?.is_active
        ? "It is currently outside of the campaign's calling hours"
        : null;
  const scheduleDisabled = readiness.scheduleDisabledReason;

  return routeData({
    selected_id,
    hasAccess: [MemberRole.Owner, MemberRole.Admin].includes(
      userRole?.role as MemberRole,
    ),
    campaignDetails,
    user: user,
    results: resultsPromise || [], // Deferred loading
    queueCounts,
    readiness,
    joinDisabled,
    scheduleDisabled,
  });
}
