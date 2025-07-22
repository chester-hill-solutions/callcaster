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
  fetchCampaignAudience,
  fetchCampaignCounts,
  fetchCampaignData,
  fetchCampaignDetails,
  fetchOutreachData,
  fetchQueueCounts,
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
import { Audience, Campaign, Contact, Flags, IVRCampaign, LiveCampaign, MessageCampaign, Schedule, WorkspaceData, WorkspaceNumbers } from "~/lib/types";
import { SupabaseClient, User } from "@supabase/supabase-js";
import { useRealtimeData } from "~/hooks/useWorkspaceContacts";

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
  const campaignType = await supabaseClient.from('campaign').select('type').eq('id', Number(campaign_id)).single();
  if (!campaignType || !campaignType.data) {
    return redirect(`/workspaces/${workspace_id}/campaigns`);
  }
  if (campaignType.data.type === "message") {
    const { data, error } = await supabaseClient.rpc('get_campaign_messages', {
      prop_campaign_id: Number(campaign_id),
      prop_workspace_id: workspace_id
    }).csv();
    if (error || !data) {
      console.error(error);
      return json({ error: error?.message || "Error fetching campaign messages" }, { status: 500 });
    }
    return json({ csvContent: data, filename: `outreach_results_${campaign_id}.csv` });
  } else if (campaignType.data.type === "live_call" || campaignType.data.type === "robocall") {
    const { data, error } = await supabaseClient.rpc('get_campaign_attempts', {
      p_campaign_id: Number(campaign_id)
    }).csv();
    if (error || !data) {
      console.error(error);
      return json({ error: error?.message || "Error fetching campaign attempts" }, { status: 500 });
    }
    return json({ csvContent: data, filename: `outreach_results_${campaign_id}.csv` });
  }
  else {
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
  const [
    campaignType, 
    queueCounts,
    workspace,
    userRole,
  ] = await Promise.all([
    supabaseClient.from('campaign').select('type').eq('id', Number(selected_id)).single(),
    fetchQueueCounts(supabaseClient, selected_id),
    fetchCampaignData(supabaseClient, selected_id),
    getUserRole({ supabaseClient, user: user as unknown as User, workspaceId: workspace_id })
  ]);
  if (!campaignType || !campaignType.data) {
    return redirect(`/workspaces/${workspace_id}/campaigns`);
  }
  if (workspace.error) throw workspace.error;

  const campaignTable = getTable(campaignType.data.type);

  const campaignDetails = await fetchCampaignDetails(
    supabaseClient,
    selected_id,
    workspace_id,
    campaignTable
  );

  const resultsPromise = fetchBasicResults(supabaseClient, selected_id) as unknown as { disposition: string, count: number, average_call_duration: string, average_wait_time: string, expected_total: number }[];
  
  return defer({
    selected_id,
    hasAccess: [MemberRole.Owner, MemberRole.Admin].includes(userRole?.role as MemberRole),
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
  const { audiences, campaigns, phoneNumbers, workspace, supabase } = useOutletContext<{ audiences: Audience[], campaigns: Campaign[], phoneNumbers: WorkspaceNumbers[], userRole: MemberRole, workspace: WorkspaceData, supabase: SupabaseClient }>();
  const campaignData = campaigns.find(c => c?.id.toString() === selected_id);
  const csvData = useActionData() as { csvContent: string, filename: string };
  const location = useLocation();
  const route = location.pathname.split("/");
  const isCampaignParentRoute = route.length === 5;
  const { data: campaignDetailsArray, isSyncing: campaignDetailsSyncing, error: campaignDetailsError } = useRealtimeData(supabase, route[2], getTable(campaignData?.type || "live_call"), [initialCampaignDetails])
  const campaignDetails = campaignDetailsArray?.[0];
  useCsvDownload(csvData as { csvContent: string, filename: string });

  const joinDisabled = (!campaignDetails?.script_id && !campaignDetails?.body_text)
    ? "No script selected"
    : !campaignData?.caller_id
      ? "No outbound phone number selected"
      : campaignData?.status === "scheduled" ?
        `Campaign scheduled.`
        : !campaignData?.is_active
          ? "It is currently outside of the Campaign's calling hours"
          : null;

  const scheduleDisabled = (!campaignDetails?.script_id && !campaignDetails?.body_text)
    ? "No script selected"
    : !campaignData?.caller_id
      ? "No outbound phone number selected"
      : null;
  console.log(joinDisabled, scheduleDisabled);
  return (
    <div className="flex h-full w-full flex-col">
      <CampaignHeader title={campaignData?.title || ""} status={campaignData?.status || "pending"} isDesktop={false} />
      <div className="flex items-center justify-center border-b-2 border-zinc-300 p-4 sm:justify-between">
        <CampaignHeader title={campaignData?.title || ""} isDesktop status={campaignData?.status || "pending"} />
        <NavigationLinks
          hasAccess={hasAccess}
          data={campaignData}
          joinDisabled={joinDisabled}
        />
      </div>
      {hasAccess && isCampaignParentRoute && (
        <Suspense fallback={<LoadingResults />}>
          <Await resolve={results} errorElement={<ErrorLoadingResults />}>
            {(resolvedResults) =>
              {
                return resolvedResults.length < 1 ? (
                <NoResultsYet />
              ) : (
                <ResultsDisplay
                  results={resolvedResults}
                  campaign={campaignData}
                  hasAccess={hasAccess}
                  queueCounts={queueCounts}
                />
              )}
            }
          </Await>
        </Suspense>
      )}
      {isCampaignParentRoute &&
        !hasAccess &&
        (campaignData?.type === "live_call" || !campaignData?.type) && (
          <CampaignInstructions
            campaignData={campaignData}
            joinDisabled={joinDisabled}
            queueCounts={queueCounts}
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
          workspace
        }}
      />
    </div>
  );
}
