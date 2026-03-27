import {
  ActionFunctionArgs,
  defer,
  json,
  LoaderFunctionArgs,
  redirect,
} from "@remix-run/node";
import {
  Await,
  Outlet,
  useActionData,
  useLoaderData,
  useLocation,
  useOutletContext,
  useRevalidator,
} from "@remix-run/react";
import { Suspense, useEffect, useRef } from "react";
import { verifyAuth } from "@/lib/supabase.server";
import { logger as loggerServer } from "@/lib/logger.server";
import { logger as loggerClient } from "@/lib/logger.client";

import {
  fetchBasicResults,
  fetchCampaignData,
  fetchCampaignDetails,
  fetchQueueCounts,
  getUserRole,
  getWorkspaceUsers,
} from "@/lib/database.server";
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
import { downloadCsv } from "@/lib/csvDownload";
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
import { getCampaignReadiness } from "@/lib/campaign-readiness";

export type CampaignState = {
  campaign_id: string;
  workspace: string;
  title: string;
  status: string;
  type:
    | "message"
    | "robocall"
    | "live_call"
    | "simple_ivr"
    | "complex_ivr"
    | "email";
  dial_type: "call" | "predictive" | null;
  group_household_queue: boolean;
  start_date: string;
  end_date: string;
  caller_id: string | null;
  voicemail_file: string | null;
  script_id: number | null;
  audiences: NonNullable<Audience>[];
  body_text: string | null;
  message_media: string[] | null;
  voicedrop_audio: string | null;
  schedule: Schedule | null;
  is_active: boolean;
  details: LiveCampaign | MessageCampaign | IVRCampaign;
};

type CampaignTable = "live_campaign" | "message_campaign" | "ivr_campaign";

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

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { supabaseClient, user } = await verifyAuth(request);
  const rpcClient = supabaseClient as SupabaseClient<any>;
  if (!user) {
    return redirect("/signin");
  }
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
      return json(
        { error: error?.message || "Error fetching campaign messages" },
        { status: 500 },
      );
    }
    return json({
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
      return json(
        { error: error?.message || "Error fetching campaign attempts" },
        { status: 500 },
      );
    }
    return json({
      csvContent: data,
      filename: `outreach_results_${campaign_id}.csv`,
    });
  } else {
    return json({ error: "Invalid campaign type" }, { status: 400 });
  }
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { id: workspace_id, selected_id } = params;
  if (!workspace_id || !selected_id) {
    return redirect(`/workspaces/${workspace_id}/campaigns`);
  }
  const { supabaseClient, user } = await verifyAuth(request);

  if (!user) return redirect("/signin");
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

  return defer({
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

export default function CampaignScreen() {
  const {
    hasAccess,
    campaignDetails: initialCampaignDetails,
    results,
    selected_id,
    queueCounts,
  } = useLoaderData<typeof loader>();
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
  const csvData = useActionData() as { csvContent: string; filename: string };
  const location = useLocation();
  const route = location.pathname.split("/");
  const isCampaignParentRoute = route.length === 5;
  const revalidator = useRevalidator();
  const lastRevalidateRef = useRef(0);
  const realtimeTable = getTable(campaignData?.type) ?? "live_campaign";
  const workspaceRouteId = route[2] ?? "";
  const safeQueueCounts = {
    fullCount: queueCounts.fullCount ?? 0,
    queuedCount: queueCounts.queuedCount ?? 0,
  };
  const { data: campaignDetailsArray } = useRealtimeData(
    supabase,
    workspaceRouteId,
    realtimeTable,
    [initialCampaignDetails],
  );
  const campaignDetails = campaignDetailsArray?.[0];

  useSupabaseRealtimeSubscription({
    supabase,
    table: "campaign_queue",
    filter: selected_id ? `campaign_id=eq.${selected_id}` : "campaign_id=eq.-1",
    onChange: () => {
      const now = Date.now();
      if (now - lastRevalidateRef.current < 2000) return;
      lastRevalidateRef.current = now;
      revalidator.revalidate();
    },
  });

  // Handle CSV download when csvData is available
  useEffect(() => {
    if (csvData?.csvContent && csvData?.filename) {
      try {
        downloadCsv(csvData.csvContent, csvData.filename);
      } catch (error) {
        loggerClient.error("Failed to download CSV:", error);
      }
    }
  }, [csvData]);

  const readiness = getCampaignReadiness(campaignData, campaignDetails, {
    queueCount: safeQueueCounts.queuedCount ?? safeQueueCounts.fullCount,
  });
  const joinDisabled = readiness.startDisabledReason
    ? readiness.startDisabledReason
    : campaignData?.status === "scheduled"
      ? "Campaign scheduled."
      : !campaignData?.is_active
        ? "It is currently outside of the campaign's calling hours"
        : null;

  const scheduleDisabled = readiness.scheduleDisabledReason;
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
