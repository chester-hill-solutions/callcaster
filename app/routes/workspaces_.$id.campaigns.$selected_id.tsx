import { ActionFunctionArgs, defer, json, LoaderFunctionArgs, redirect } from "@remix-run/node";
import {
  Await,
  Outlet,
  useActionData,
  useLoaderData,
  useLocation,
  useOutletContext,
  useSubmit,
} from "@remix-run/react";
import { Suspense } from "react";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

import {
  checkSchedule,
  fetchBasicResults,
  fetchCampaignCounts,
  fetchCampaignData,
  fetchCampaignDetails,
  fetchOutreachData,
  getMedia,
  getRecordingFileNames,
  getSignedUrls,
  getUserRole,
  getWorkspacePhoneNumbers,
  getWorkspaceScripts,
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
import { Audience, Flags } from "~/lib/types";
import { SupabaseClient } from "@supabase/supabase-js";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { supabaseClient, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession?.user) {
    return redirect("/signin");
  }
  const { id: workspace_id, selected_id: campaign_id } = params;
  if (!workspace_id || !campaign_id) throw redirect("../");
  const { data: users } = await getWorkspaceUsers({ supabaseClient, workspaceId: workspace_id });
  const outreachData = await fetchOutreachData(supabaseClient, campaign_id);

  if (!outreachData || outreachData.length === 0) {
    return new Response("No data found", { status: 404 });
  }

  const { csvHeaders, flattenedData } = processOutreachExportData(
    outreachData,
    users,
  );
  const csvContent = generateCSVContent(csvHeaders, flattenedData);

  return json({
    csvContent,
    filename: `outreach_results_${campaign_id}.csv`,
  });
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { id: workspace_id, selected_id } = params;
  if (!workspace_id || !selected_id) throw redirect("../../");

  const { supabaseClient, headers, serverSession } = await getSupabaseServerClientWithSession(request);
  if (!serverSession?.user) throw redirect("/signin");
  const campaignData = await fetchCampaignData(supabaseClient, selected_id);
  if (!campaignData) throw redirect("../../");

  const campaignCounts = await fetchCampaignCounts(supabaseClient, selected_id);
  const { data: phoneNumbers } = await getWorkspacePhoneNumbers({ supabaseClient, workspaceId: workspace_id });

  const scripts = await getWorkspaceScripts({ workspace: workspace_id, supabase: supabaseClient });

  const campaignType = campaignData.type;
  const campaignDetails = await fetchCampaignDetails(
    supabaseClient,
    selected_id,
    workspace_id,
    campaignType === "live_call"
      ? "live_campaign"
      : campaignType === "message"
        ? "message_campaign"
        : ["robocall", "simple_ivr", "complex_ivr"].includes(campaignType)
          ? "ivr_campaign"
          : "",
  );

  const { data: mediaData } = await supabaseClient.storage.from("workspaceAudio").list(workspace_id) ?? { data: [] };
  let mediaLinksPromise;
  if (
    campaignType === "message" &&
    campaignDetails?.message_media?.length > 0
  ) {
    mediaLinksPromise = getSignedUrls(
      supabaseClient,
      workspace_id,
      campaignDetails.message_media,
    );
  } else if (campaignType === "robocall") {
    mediaLinksPromise = getMedia(
      getRecordingFileNames(campaignDetails.step_data),
      supabaseClient,
      workspace_id,
    );
  }

  const userRole = getUserRole({ serverSession, workspaceId: workspace_id });
  const hasAccess = [MemberRole.Owner, MemberRole.Admin].includes(userRole);
  const isActive = (campaignData.is_active) && checkSchedule(campaignData);
  return defer({
    campaignData,
    campaignDetails,
    hasAccess,
    user: serverSession?.user,
    results: fetchBasicResults(supabaseClient, selected_id),
    campaignCounts,
    phoneNumbers,
    mediaData: mediaData ?? [],
    scripts,
    mediaLinks: mediaLinksPromise,
    isActive,
    totalCalls: 0,
    expectedTotal: 0,
  });
};

export default function CampaignScreen() {
  const { audiences, flags, supabase } = useOutletContext<{ audiences: Audience[], flags: Flags, supabase: SupabaseClient }>();
  const {
    campaignData,
    campaignDetails,
    hasAccess,
    results,
    campaignCounts,
    totalCalls = 0,
    expectedTotal = 0,
    user,
    phoneNumbers,
    mediaData,
    scripts,
    mediaLinks,
    isActive,
  } = useLoaderData<typeof loader>();
  const csvData = useActionData();
  const route = useLocation().pathname.split("/");
  const isCampaignParentRoute = !Number.isNaN(parseInt(route.at(-1) ?? ''));
  const submit = useSubmit();
  useCsvDownload(csvData);

  const joinDisabled = (!campaignDetails?.script_id && !campaignDetails.body_text)
    ? "No script selected"
    : !campaignData.caller_id
      ? "No outbound phone number selected"
      : campaignData.status === "scheduled" ?
        `Campaign scheduled.`
        : !isActive
          ? "It is currently outside of the Campaign's calling hours"
          : null;
  const scheduleDisabled = (!campaignDetails?.script_id && !campaignDetails.body_text)
    ? "No script selected"
    : !campaignData.caller_id
      ? "No outbound phone number selected"
      : null;
  return (
    <div className="flex h-full w-full flex-col">
      <CampaignHeader title={campaignData.title} status={campaignData.status} isDesktop={false} />
      <div className="flex items-center justify-center border-b-2 border-zinc-300 p-4 sm:justify-between">
        <CampaignHeader title={campaignData.title} isDesktop status={campaignData.status} />
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
              resolvedResults.length < 1 ? (
                <NoResultsYet campaign={campaignData} user={user} submit={submit} />
              ) : (
                <ResultsDisplay
                  results={resolvedResults}
                  campaign={campaignData}
                  hasAccess={hasAccess}
                  user={user}
                  campaignCounts={campaignCounts}
                />
              )
            }
          </Await>
        </Suspense>
      )}
      {isCampaignParentRoute &&
        !hasAccess &&
        (campaignData.type === "live_call" || !campaignData.type) && (
          <CampaignInstructions
            campaignData={campaignData}
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
          campaignData,
          campaignDetails,
          phoneNumbers,
          mediaData,
          scripts,
          user,
          mediaLinks,
          flags,
          scheduleDisabled,
        }}
      />
    </div>
  );
}
