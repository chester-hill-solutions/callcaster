import {
  IVRCampaign,
  LiveCampaign,
  MessageCampaign,
} from "@/lib/types";
import { data as routeData, redirect } from "react-router";
import { fetchBasicResults, fetchCampaignDetails, fetchQueueCounts, getUserRole } from "@/lib/database.server";
import { getCampaignReadiness } from "@/lib/campaign-readiness";
import { findCampaignInWorkspace } from "@/lib/campaign-ivr.server";
import { MemberRole } from "@/lib/member-role";
import { verifyAuth } from "@/lib/auth.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {

  const { id: workspace_id, selected_id } = params;
  if (!workspace_id || !selected_id) {
    return redirect(`/workspaces/${workspace_id}/campaigns`);
  }
  const { user } = await verifyAuth(request);

  const [campaignRow, queueCounts, userRole] = await Promise.all([
    findCampaignInWorkspace(workspace_id, selected_id),
    fetchQueueCounts({ workspaceId: workspace_id, campaignId: selected_id}),
    getUserRole({ user, workspaceId: workspace_id }),
  ]);
  if (!campaignRow?.type) {
    return redirect(`/workspaces/${workspace_id}/campaigns`);
  }

  const campaignDetails = (await fetchCampaignDetails({
    workspaceId: workspace_id,
    campaignId: selected_id,
  })) as LiveCampaign | MessageCampaign | IVRCampaign | null;

  const resultsPromise = fetchBasicResults({
    workspaceId: workspace_id,
    campaignId: selected_id,
  }) as unknown as {
    disposition: string;
    count: number;
    average_call_duration: string;
    average_wait_time: string;
    expected_total: number;
  }[];

  const readiness = getCampaignReadiness(campaignRow, campaignDetails, {
    queueCount: queueCounts.queuedCount ?? queueCounts.fullCount,
  });
  const joinDisabled = readiness.startDisabledReason
    ? readiness.startDisabledReason
    : campaignRow?.status === "scheduled"
      ? "Campaign scheduled."
      : !campaignRow?.is_active
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
