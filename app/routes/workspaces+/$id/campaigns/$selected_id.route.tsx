export { loader } from "./$selected_id.loader.server";
export { action } from "./$selected_id.action.server";

import { Outlet, useLoaderData, useLocation, useOutletContext, useRevalidator } from "react-router";
import { useMemo, useRef } from "react";

import { MemberRole } from "@/components/workspace/TeamMember";
import {
  ResultsDisplay,
  NoResultsYet,
  ErrorLoadingResults,
} from "@/components/campaign/home/CampaignHomeScreen/CampaignResultDisplay";
import { CampaignInstructions } from "@/components/campaign/home/CampaignHomeScreen/CampaignInstructions";
import { CampaignHeader } from "@/components/campaign/home/CampaignHomeScreen/CampaignHeader";
import { CampaignStatusRail } from "@/components/campaign/home/CampaignStatusRail";
import { CampaignShellDirtyProvider } from "@/components/campaign/home/CampaignShellDirty";
import { buildCampaignStatusRail } from "@/lib/campaign-status-rail";
import { resolveReadinessQueueCount } from "@/lib/campaign-readiness";
import {
  Audience,
  Campaign,
  WorkspaceData,
  WorkspaceNumbers,
} from "@/lib/types";
import type { CampaignStatus } from "@/lib/db-types";
import { useWorkspaceEventSubscription } from "@/hooks/realtime/useWorkspaceRealtime";

import type { CampaignState } from "@/lib/campaign-home.types";
export type { CampaignState } from "@/lib/campaign-home.types";

/** Tables whose row changes affect dashboard queue + disposition counts from the loader. */
const CAMPAIGN_DASHBOARD_COUNT_TABLES = [
  "campaign_queue",
  "outreach_attempt",
  "call",
  "message",
] as const;

export default function CampaignScreen() {
  const {
    hasAccess,
    campaignDetails: initialCampaignDetails,
    results,
    ivrResponses,
    selected_id,
    queueCounts,
    readiness,
    joinDisabled,
    scheduleDisabled,
  } = useLoaderData();
  const { audiences, campaigns, phoneNumbers, workspace } =
    useOutletContext<{
      audiences: Audience[];
      campaigns: Campaign[];
      phoneNumbers: WorkspaceNumbers[];
      userRole: MemberRole;
      workspace: WorkspaceData;
    }>();
  const campaignData = campaigns.find((c) => c?.id.toString() === selected_id);
  const location = useLocation();
  const route = location.pathname.split("/");
  const isCampaignParentRoute = route.length === 5;
  const revalidator = useRevalidator();
  const lastRevalidateRef = useRef(0);
  const workspaceRouteId = route[2] ?? "";
  const safeQueueCounts = {
    fullCount: queueCounts.fullCount ?? 0,
    queuedCount: queueCounts.queuedCount ?? 0,
    completedCount: queueCounts.completedCount ?? 0,
  };
  const campaignQueueProgress =
    safeQueueCounts.fullCount > 0
      ? {
          completedCount: safeQueueCounts.completedCount,
          totalCount: safeQueueCounts.fullCount,
        }
      : null;
  const campaignDetails = initialCampaignDetails;

  const railItems = useMemo(() => {
    if (!campaignData || !workspaceRouteId || !selected_id) {
      return [];
    }
    const workspaceId =
      typeof workspace === "object" && workspace && "id" in workspace
        ? String((workspace as { id?: string }).id ?? workspaceRouteId)
        : workspaceRouteId;

    return buildCampaignStatusRail({
      workspaceId,
      campaignId: selected_id,
      campaignData,
      campaignDetails,
      readinessIssues: readiness?.issues ?? [],
      // Defense-in-depth: buildCampaignStatusRail only recomputes readiness
      // from this queueCount when readinessIssues is absent, but keep it
      // consistent (total assigned audience, not remaining queue rows) so
      // a completed campaign never appears "needs attention" here either.
      queueCount: resolveReadinessQueueCount({
        totalCount: safeQueueCounts.fullCount,
        queuedCount: safeQueueCounts.queuedCount,
      }),
      hasAccess,
      pathname: location.pathname,
      hash: location.hash,
      joinDisabled,
      hasResults: results.length > 0 || ivrResponses.length > 0,
    });
  }, [
    campaignData,
    campaignDetails,
    hasAccess,
    ivrResponses.length,
    joinDisabled,
    location.hash,
    location.pathname,
    readiness?.issues,
    results.length,
    safeQueueCounts.fullCount,
    safeQueueCounts.queuedCount,
    selected_id,
    workspace,
    workspaceRouteId,
  ]);

  useWorkspaceEventSubscription({
    workspaceId: workspaceRouteId,
    table: [...CAMPAIGN_DASHBOARD_COUNT_TABLES],
    filter: selected_id ? `campaign_id=eq.${selected_id}` : "campaign_id=eq.-1",
    onChange: () => {
      const now = Date.now();
      if (now - lastRevalidateRef.current < 2000) return;
      lastRevalidateRef.current = now;
      revalidator.revalidate();
    },
  });

  return (
    <CampaignShellDirtyProvider>
      <div className="flex h-full w-full flex-col">
        <CampaignHeader
          title={campaignData?.title || ""}
          status={(campaignData?.status as CampaignStatus) || "pending"}
          isDesktop={false}
          queueProgress={campaignQueueProgress}
        />
        <div className="border-b border-border/70 pb-4">
          <CampaignHeader
            title={campaignData?.title || ""}
            isDesktop
            status={(campaignData?.status as CampaignStatus) || "pending"}
          />
        </div>
        {railItems.length > 0 ? (
          <div className="pb-4">
            <CampaignStatusRail items={railItems} />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          {hasAccess &&
            isCampaignParentRoute &&
            (!campaignData ? (
              <ErrorLoadingResults />
            ) : results.length < 1 && ivrResponses.length < 1 ? (
              <NoResultsYet
                expectedTotal={safeQueueCounts.fullCount}
                campaignType={campaignData.type}
              />
            ) : (
              <ResultsDisplay
                results={results}
                campaign={campaignData}
                hasAccess={hasAccess}
                queueCounts={safeQueueCounts}
                ivrResponses={ivrResponses}
              />
            ))}
          {isCampaignParentRoute &&
            !hasAccess &&
            campaignData &&
            (campaignData.type === "live_call" || !campaignData.type) && (
              <CampaignInstructions
                campaignData={
                  campaignData as {
                    [key: string]: unknown;
                    instructions?: { join?: string; script?: string };
                  }
                }
                totalCalls={safeQueueCounts.queuedCount}
                expectedTotal={safeQueueCounts.fullCount}
                joinDisabled={joinDisabled}
              />
            )}
          <Outlet
            context={{
              joinDisabled,
              audiences,
              campaignData,
              campaignDetails,
              scheduleDisabled,
              phoneNumbers,
              workspace,
            }}
          />
        </div>
      </div>
    </CampaignShellDirtyProvider>
  );
}
