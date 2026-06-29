export { loader } from "./$selected_id.loader.server";
export { action } from "./$selected_id.action.server";

import { data as routeData, ActionFunctionArgs, LoaderFunctionArgs, redirect } from "react-router";
import { Await, Outlet, useLoaderData, useLocation, useOutletContext, useRevalidator } from "react-router";
import { Suspense, useRef } from "react";


import { MemberRole } from "@/components/workspace/TeamMember";
import {
  ResultsDisplay,
  NoResultsYet,
  ErrorLoadingResults,
  LoadingResults,
} from "@/components/campaign/home/CampaignHomeScreen/CampaignResultDisplay";
import { CampaignInstructions } from "@/components/campaign/home/CampaignHomeScreen/CampaignInstructions";
import { CampaignHeader } from "@/components/campaign/home/CampaignHomeScreen/CampaignHeader";
import { NavigationLinks } from "@/components/campaign/home/CampaignHomeScreen/CampaignNav";
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
import { SupabaseClient } from "@supabase/supabase-js";
import { useSupabaseRealtimeSubscription } from "@/hooks/realtime/useSupabaseRealtime";
import { useRealtimeData } from "@/hooks/realtime/useRealtimeData";

import type { CampaignState } from "@/lib/campaign-home.types";
export type { CampaignState } from "@/lib/campaign-home.types";

type CampaignTable = "campaign";

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
    selected_id,
    queueCounts,
    readiness,
    joinDisabled,
    scheduleDisabled,
  } = useLoaderData();
  const { audiences, campaigns, phoneNumbers, workspace, supabase } =
    useOutletContext<{
      audiences: Audience[];
      campaigns: Campaign[];
      phoneNumbers: WorkspaceNumbers[];
      userRole: MemberRole;
      workspace: WorkspaceData;
      supabase: SupabaseClient;
    }>();
  const campaignData = campaigns.find((c) => c?.id.toString() === selected_id);
  const location = useLocation();
  const route = location.pathname.split("/");
  const isCampaignParentRoute = route.length === 5;
  const revalidator = useRevalidator();
  const lastRevalidateRef = useRef(0);
  const realtimeTable: CampaignTable = "campaign";
  const workspaceRouteId = route[2] ?? "";
  const safeQueueCounts = {
    fullCount: queueCounts.fullCount ?? 0,
    queuedCount: queueCounts.queuedCount ?? 0,
  };
  const { data: campaignDetailsArray } = useRealtimeData(
    supabase,
    workspaceRouteId,
    realtimeTable,
    [
      initialCampaignDetails
        ? { ...initialCampaignDetails, id: Number(selected_id) }
        : null,
    ],
  );
  const campaignDetails = campaignDetailsArray?.[0];

  useSupabaseRealtimeSubscription({
    supabase,
    channelTopic: selected_id
      ? `campaign-dashboard-counts-${selected_id}`
      : "campaign-dashboard-counts-none",
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
    <div className="flex h-full w-full flex-col">
      <CampaignHeader
        title={campaignData?.title || ""}
        status={campaignData?.status || "pending"}
        isDesktop={false}
      />
      <div className="flex flex-col items-start justify-between gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-center">
        <CampaignHeader
          title={campaignData?.title || ""}
          isDesktop
          status={campaignData?.status || "pending"}
        />
        <NavigationLinks
          hasAccess={hasAccess}
          data={campaignData}
          joinDisabled={joinDisabled}
        />
      </div>
      {hasAccess && isCampaignParentRoute && (
        <Suspense fallback={<LoadingResults />}>
          <Await resolve={results} errorElement={<ErrorLoadingResults />}>
            {(resolvedResults) => {
              if (!campaignData) {
                return <ErrorLoadingResults />;
              }
              return resolvedResults.length < 1 ? (
                <NoResultsYet />
              ) : (
                <ResultsDisplay
                  results={resolvedResults}
                  campaign={campaignData}
                  hasAccess={hasAccess}
                  queueCounts={safeQueueCounts}
                />
              );
            }}
          </Await>
        </Suspense>
      )}
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
          supabase,
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
  );
}
