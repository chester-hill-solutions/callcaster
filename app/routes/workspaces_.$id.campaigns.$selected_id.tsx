import { defer, json, LoaderFunctionArgs, redirect } from "@remix-run/node";
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

export const action = async ({ request, params }) => {
  const { supabaseClient, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession?.user) {
    return redirect("/signin");
  }

  const { id: workspace_id, selected_id: campaign_id } = params;

  const { data: users } = await getWorkspaceUsers({
    supabaseClient,
    workspaceId: workspace_id,
  });
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
export const loader = async ({ request, params }:LoaderFunctionArgs) => {
  const { id: workspace_id, selected_id } = params;

  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession?.user) return redirect("/signin");

  const [
    campaignData,
    resultsPromise,
    { data: phoneNumbers },
    { data: mediaData },
    scripts,
  ] = await Promise.all([
    fetchCampaignData(supabaseClient, selected_id),
    fetchBasicResults(supabaseClient, selected_id, headers),
    getWorkspacePhoneNumbers({ supabaseClient, workspaceId: workspace_id }),
    supabaseClient.storage.from("workspaceAudio").list(workspace_id),
    getWorkspaceScripts({ workspace: workspace_id, supabase: supabaseClient }),
  ]);

  if (!campaignData)
    return json({ error: "Campaign not found" }, { status: 404 });

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

  const data = { ...campaignData, campaignDetails };

  const userRole = getUserRole({ serverSession, workspaceId: workspace_id });
  const hasAccess = [MemberRole.Owner, MemberRole.Admin].includes(userRole);
  const isActive = checkSchedule(campaignData);
  
  return defer({
    data,
    hasAccess,
    user: serverSession?.user,
    results: resultsPromise,
    phoneNumbers,
    mediaData,
    scripts,
    mediaLinks: mediaLinksPromise,
    isActive
  });
};

export default function CampaignScreen() {
  const { audiences, flags } = useOutletContext();
  const {
    data,
    hasAccess,
    results,
    totalCalls = 0,
    expectedTotal = 0,
    user,
    phoneNumbers,
    mediaData,
    scripts,
    mediaLinks,
    isActive
  } = useLoaderData<typeof loader>();
  const csvData = useActionData();
  const route = useLocation().pathname.split("/");
  const isCampaignParentRoute = !Number.isNaN(parseInt(route.at(-1)));
  const campaign = data.length ? data : {};
  const submit = useSubmit();
  useCsvDownload(csvData);

  const joinDisabled = !data?.campaignDetails?.script_id ? "No script selected" : !data.caller_id ? "No outbound phone number selected" : !data.campaign_audience?.length ? "No audiences selected" : !isActive ? "It is currently outside of the Campaign's calling hours": null;
  

  return (
    <div className="flex h-full w-full flex-col">
      <CampaignHeader title={data?.title} status={data.status}/>
      <div className="flex items-center justify-center border-b-2 border-zinc-300 p-4 sm:justify-between">
        <CampaignHeader title={data?.title} isDesktop status={data.status} />
        <NavigationLinks
          hasAccess={hasAccess}
          data={data}
          joinDisabled={(!isActive ? "This campaign is currently deactivated" : false) || joinDisabled}
        />
      </div>
      {hasAccess && isCampaignParentRoute && (
        <Suspense fallback={<LoadingResults />}>
          <Await resolve={results} errorElement={<ErrorLoadingResults />}>
            {(resolvedResults) =>
              resolvedResults.length < 1 ? (
                <NoResultsYet campaign={data} user={user} submit={submit} />
              ) : (
                <ResultsDisplay
                  results={resolvedResults}
                  campaign={data}
                  hasAccess={hasAccess}
                  user={user}
                />
              )
            }
          </Await>
        </Suspense>
      )}
      {isCampaignParentRoute &&
        !hasAccess &&
        (campaign.type === "live_call" || !campaign.type) && (
          <CampaignInstructions
            campaign={campaign}
            data={data}
            totalCalls={totalCalls}
            expectedTotal={expectedTotal}
            joinDisabled={joinDisabled}
          />
        )}
      <Outlet
        context={{
          joinDisabled,
          audiences,
          data,
          phoneNumbers,
          mediaData,
          scripts,
          user,
          mediaLinks,
          flags,
        }}
      />
    </div>
  );
}
