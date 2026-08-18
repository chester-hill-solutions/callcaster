import { getWorkspaceRouteContext } from "@/lib/workspace-route.server";
import { isCampaignActive } from "@/lib/campaign-status";
import {
  IVRCampaign,
  LiveCampaign,
  MessageCampaign,
} from "@/lib/types";
import { data as routeData, redirect } from "react-router";
import {
  fetchBasicResults,
  fetchCampaignDetails,
  fetchIvrResponseResults,
  fetchQueueCounts,
} from "@/lib/database/campaign.server";
import { campaignTypeCollectsIvrResponses } from "@/lib/ivr-results";
import { getUserRole } from "@/lib/database/workspace.server";
import { getCampaignReadiness, resolveReadinessQueueCount } from "@/lib/campaign-readiness";
import { findCampaignInWorkspace } from "@/lib/campaign-ivr.server";
import { MemberRole } from "@/lib/member-role";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: ({ params, context }) => {
    const { id: workspace_id, selected_id } = params;
    if (!workspace_id || !selected_id) {
      return redirect(`/workspaces/${workspace_id}/campaigns`);
    }
    return { ...getWorkspaceRouteContext(context), workspace_id, selected_id };
  },
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    const { user, workspace_id, selected_id } = auth;

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

    // Awaited, NOT deferred. These were streamed to the client as deferred
    // promises and consumed via <Await>, but that hung the page: for a real
    // browser (bots take the `await body.allReady` path in entry.server and are
    // unaffected) the shell flushed with the fallback and the turbo-stream was
    // never closed, so the client's decoded promise could never settle —
    // React #419, then "Loading results..." forever. A never-settling promise
    // is not a rejecting one, so <Await errorElement> never fired either.
    //
    // The deferral bought ~25ms (get_campaign_stats) against a fully-resolved
    // document of ~150ms, so awaiting is strictly better than a broken page.
    // Re-defer only with a browser test that asserts the content renders AFTER
    // hydration — the previous regression test only asserted the stream closed,
    // which is why this survived.
    const [results, ivrResponses] = await Promise.all([
      fetchBasicResults({
        workspaceId: workspace_id,
        campaignId: selected_id,
      }),
      campaignTypeCollectsIvrResponses(campaignRow.type)
        ? fetchIvrResponseResults({
            workspaceId: workspace_id,
            campaignId: selected_id,
          })
        : Promise.resolve([]),
    ]);

    // Total assigned audience, not remaining/undequeued rows -- the
    // remaining count is 0 both pre-launch and after the campaign finishes
    // sending, which would flip the "Launch" rail item and this readiness
    // check to "needs attention" on a fully completed campaign (#1255).
    const readiness = getCampaignReadiness(campaignRow, campaignDetails, {
      queueCount: resolveReadinessQueueCount({
        totalCount: queueCounts.fullCount,
        queuedCount: queueCounts.queuedCount,
      }),
    });
    const joinDisabled = readiness.startDisabledReason
      ? readiness.startDisabledReason
      : campaignRow?.status === "scheduled"
        ? "Campaign scheduled."
        : !isCampaignActive(campaignRow?.status)
          ? campaignRow?.status === "draft" || campaignRow?.status === "pending"
            ? "Campaign is not live yet. Start it from the Launch page."
            : campaignRow?.status === "paused"
              ? "Campaign is paused."
              : "It is currently outside of the campaign's calling hours"
          : null;
    const scheduleDisabled = readiness.scheduleDisabledReason;

    return routeData({
      selected_id,
      hasAccess: [MemberRole.Owner, MemberRole.Admin].includes(
        userRole?.role as MemberRole,
      ),
      campaignDetails,
      user: user,
      results,
      ivrResponses,
      queueCounts,
      readiness,
      joinDisabled,
      scheduleDisabled,
    });
  },
});
