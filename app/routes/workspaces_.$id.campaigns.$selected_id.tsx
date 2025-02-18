import { ActionFunctionArgs, defer, json, LoaderFunctionArgs, redirect, Session } from "@remix-run/node";
import {
  Await,
  Outlet,
  useActionData,
  useLoaderData,
  useLocation,
  useOutletContext,
} from "@remix-run/react";
import { Suspense } from "react";
import { verifyAuth } from "~/lib/supabase.server";

import {
  fetchBasicResults,
  fetchCampaignCounts,
  fetchCampaignDetails,
  fetchOutreachData,
  getUserRole,
  getWorkspaceUsers,
  processOutreachExportData,
} from "~/lib/database.server";
import { MemberRole } from "~/components/Workspace/TeamMember";
import {
  ResultsDisplay,
  NoResultsYet,
  ErrorLoadingResults,
  LoadingResults,
} from "~/components/CampaignHomeScreen/CampaignResultDisplay";
import { CampaignInstructions } from "~/components/CampaignHomeScreen/CampaignInstructions";
import { CampaignHeader } from "~/components/CampaignHomeScreen/CampaignHeader";
import { NavigationLinks } from "~/components/CampaignHomeScreen/CampaignNav";
import { useCsvDownload } from "~/hooks/useCsvDownload";
import { generateCSVContent } from "~/lib/utils";
import { Audience, IVRCampaign, LiveCampaign, MessageCampaign, Schedule, WorkspaceData, WorkspaceNumbers } from "~/lib/types";
import { SupabaseClient, User } from "@supabase/supabase-js";
import { useRealtimeData } from "~/hooks/useWorkspaceContacts";
import { Json } from "~/lib/database.types";

interface ExtendedUser extends User {
  access_level: string | null;
  activity: Json;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  organization: number | null;
  username: string;
}

export type CampaignState = {
  campaign_id: string;
  workspace: string;
  title: string;
  status: string;
  type: "message" | "robocall" | "live_call" | "simple_ivr" | "complex_ivr" | "email";
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

const getTable = (campaignType: string) => {
  return campaignType === "live_call"
    ? "live_campaign"
    : campaignType === "message"
      ? "message_campaign"
      : ["robocall", "simple_ivr", "complex_ivr"].includes(campaignType)
        ? "ivr_campaign"
        : "";
}

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { supabaseClient, user } = await verifyAuth(request);
  if (!user) {
    return redirect("/signin");
  }
  const { id: workspace_id, selected_id: campaign_id } = params;
  if (!workspace_id || !campaign_id) {
    return redirect(`/workspaces/${workspace_id}/campaigns`);
  }
  const { data: users } = await getWorkspaceUsers({ supabaseClient, workspaceId: workspace_id });
  const outreachData = await fetchOutreachData(supabaseClient, campaign_id);

  if (!outreachData || outreachData.length === 0) {
    return new Response("No data found", { status: 404 });
  }

  const { csvHeaders, flattenedData } = processOutreachExportData(
    [outreachData].filter(Boolean),
    (users ?? []).map(u => u as any)
  );
  const csvContent = generateCSVContent(csvHeaders as string[], flattenedData as any[]);

  return json({
    csvContent,
    filename: `outreach_results_${campaign_id}.csv`,
  });
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { id: workspace_id, selected_id } = params;
  
  if (!workspace_id || !selected_id) {
    throw new Error("Missing required parameters");
  }
  
  const { supabaseClient, user } = await verifyAuth(request);
  if (!user) {
    throw redirect("/signin");
  }

  // Fetch campaign data and type in parallel
  const [campaignResponse, userRole] = await Promise.all([
    supabaseClient
      .from('campaign')
      .select('*, type')
      .eq('id', Number(selected_id))
      .single(),
    getUserRole({ 
      supabaseClient, 
      user: user as unknown as ExtendedUser, 
      workspaceId: workspace_id 
    })
  ]);

  if (campaignResponse.error || !campaignResponse.data) {
    console.error("Campaign fetch error:", campaignResponse.error);
    throw redirect(`/workspaces/${workspace_id}/campaigns`);
  }

  const campaign = campaignResponse.data;
  const campaignTable = getTable(campaign.type || "live_call");

  // Fetch campaign details and counts
  const [campaignDetails, campaignCounts] = await Promise.all([
    fetchCampaignDetails(
      supabaseClient,
      selected_id,
      workspace_id,
      campaignTable
    ),
    fetchCampaignCounts(supabaseClient, selected_id)
  ]);

  if (!campaignDetails) {
    console.error("Campaign details not found");
    throw redirect(`/workspaces/${workspace_id}/campaigns`);
  }

  // Start loading results in the background
  const resultsPromise = fetchBasicResults(supabaseClient, selected_id);
  
  return defer({
    selected_id,
    hasAccess: [MemberRole.Owner, MemberRole.Admin].includes(userRole as MemberRole),
    campaignDetails,
    campaignData: campaign,
    user,
    campaignCounts,
    totalCalls: 0,
    expectedTotal: 0,
    results: resultsPromise || [], // Deferred loading
  });
};

export default function CampaignScreen() {
  const {
    hasAccess,
    campaignDetails: initialCampaignDetails,
    campaignData: initialCampaignData,
    campaignCounts,
    totalCalls = 0,
    expectedTotal = 0,
    results,
    selected_id,
  } = useLoaderData<typeof loader>();
  const { audiences, phoneNumbers, workspace, supabase } = useOutletContext<{ audiences: Audience[], phoneNumbers: WorkspaceNumbers[], userRole: MemberRole, workspace: WorkspaceData, supabase: SupabaseClient }>();
  const csvData = useActionData() as { csvContent: string, filename: string };
  const location = useLocation();
  const route = location.pathname.split("/");
  const isCampaignParentRoute = route.length === 5;
  const { data: campaignDetailsArray, isSyncing: campaignDetailsSyncing, error: campaignDetailsError } = useRealtimeData(supabase, route[2], getTable(initialCampaignData?.type || "live_call"), [initialCampaignDetails])
  const campaignDetails = campaignDetailsArray?.[0];
  
  useCsvDownload(csvData as { csvContent: string, filename: string });
  const joinDisabled = (!campaignDetails?.script_id && !campaignDetails?.body_text)
    ? "No script selected"
    : !initialCampaignData?.caller_id
      ? "No outbound phone number selected"
      : initialCampaignData?.status === "scheduled" ?
        `Campaign scheduled.`
        : !initialCampaignData?.is_active
          ? "It is currently outside of the Campaign's calling hours"
          : null;
  const scheduleDisabled = (!campaignDetails?.script_id && !campaignDetails?.body_text)
    ? "No script selected"
    : !initialCampaignData?.caller_id
      ? "No outbound phone number selected"
      : null;
  return (
    <div className="flex h-full w-full flex-col">
      <CampaignHeader title={initialCampaignData?.title || ""} status={initialCampaignData?.status || "pending"} isDesktop={false} />
      <div className="flex items-center justify-center border-b-2 border-zinc-300 p-4 sm:justify-between">
        <CampaignHeader title={initialCampaignData?.title || ""} isDesktop status={initialCampaignData?.status || "pending"} />
        <NavigationLinks
          hasAccess={hasAccess}
          data={initialCampaignData}
          joinDisabled={joinDisabled}
        />
      </div>
      {hasAccess && isCampaignParentRoute && (
        <Suspense fallback={<LoadingResults />}>
          <Await resolve={results} errorElement={<ErrorLoadingResults />}>
            {(resolvedResults) =>
              resolvedResults.length < 1 ? (
                <NoResultsYet />
              ) : (
                <ResultsDisplay
                  results={resolvedResults}
                  campaign={initialCampaignData}
                  hasAccess={hasAccess}
                  campaignCounts={campaignCounts}
                />
              )
            }
          </Await>
        </Suspense>
      )}
      {isCampaignParentRoute &&
        !hasAccess &&
        (initialCampaignData?.type === "live_call" || !initialCampaignData?.type) && (
          <CampaignInstructions
            campaignData={initialCampaignData}
            totalCalls={totalCalls}
            expectedTotal={expectedTotal}
            joinDisabled={joinDisabled}
          />
        )}
      <Outlet
        context={{
          supabase,
          joinDisabled,
          audiences,
          campaignData: initialCampaignData,
          campaignDetails,
          scheduleDisabled,
          phoneNumbers,
          workspace
        }}
      />
    </div>
  );
}
