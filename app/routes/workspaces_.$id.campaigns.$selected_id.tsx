import { defer, json, redirect } from "@remix-run/node";
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
  fetchBasicResults,
  fetchCampaignData,
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
import {CampaignInstructions} from "~/components/CampaignHomeScreen/CampaignInstructions";
import { CampaignHeader } from "~/components/CampaignHomeScreen/CampaignHeader";
import { NavigationLinks } from "~/components/CampaignHomeScreen/CampaignNav";
import { useCsvDownload } from "~/hooks/useCsvDownload";
import { generateCSVContent } from "~/lib/utils";

export const action = async ({ request, params }) => {
  const { supabaseClient, serverSession } = await getSupabaseServerClientWithSession(request);
  if (!serverSession?.user) {
    return redirect("/signin");
  }

  const { id: workspace_id, selected_id: campaign_id } = params;

  const {data: users} = await getWorkspaceUsers({supabaseClient, workspaceId: workspace_id});
  const outreachData = await fetchOutreachData(supabaseClient, campaign_id);

  if (!outreachData || outreachData.length === 0) {
    return new Response("No data found", { status: 404 });
  }
  const { csvHeaders, flattenedData } = processOutreachExportData(outreachData, users);
  const csvContent = generateCSVContent(csvHeaders, flattenedData);

  return json({
    csvContent,
    filename: `outreach_results_${campaign_id}.csv`,
  });
};


export const loader = async ({ request, params }) => {
  const { id: workspace_id, selected_id } = params;

  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession?.user) return redirect("/signin");
  const resultsPromise = fetchBasicResults(
    supabaseClient,
    selected_id,
    headers,
  );

  const campaignData = await fetchCampaignData(supabaseClient, selected_id);
  if (!campaignData)
    return json({ error: "Campaign not found" }, { status: 404 });
  let campaignDetails = null;
  const campaignType = campaignData.type;
  if (campaignType === "live_call") {
    campaignDetails = await fetchCampaignDetails(
      supabaseClient,
      selected_id,
      workspace_id,
      "live_campaign",
    );
  } else if (campaignType === "message") {
    campaignDetails = await fetchCampaignDetails(
      supabaseClient,
      selected_id,
      workspace_id,
      "message_campaign",
    );
  } else if (["robocall", "simple_ivr", "complex_ivr"].includes(campaignType)) {
    campaignDetails = await fetchCampaignDetails(
      supabaseClient,
      selected_id,
      workspace_id,
      "ivr_campaign",
    );
  }

  const data = { ...campaignData, campaignDetails };

  const userRole = getUserRole({ serverSession, workspaceId: workspace_id });
  const hasAccess = [MemberRole.Owner, MemberRole.Admin].includes(userRole);

  return defer({
    data,
    hasAccess,
    user: serverSession?.user,
    results: resultsPromise,
  });
};

export default function CampaignScreen() {
  const { audiences } = useOutletContext();
  const {
    data = [],
    hasAccess,
    results,
    totalCalls = 0,
    expectedTotal = 0,
    user,
  } = useLoaderData<typeof loader>();
  const csvData = useActionData();
  const route = useLocation().pathname.split("/");
  const isCampaignParentRoute = !Number.isNaN(parseInt(route.at(-1)));
  const campaign = data.length ? data : {};
  const submit = useSubmit();
  useCsvDownload(csvData);

  return (
    <div className="flex h-full w-full flex-col">
      <CampaignHeader title={data?.title} />
      <div className="flex items-center justify-center border-b-2 border-zinc-300 p-4 sm:justify-between">
        <CampaignHeader title={data?.title} isDesktop/>
        <NavigationLinks hasAccess={hasAccess} data={data} />
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
          />
        )}
      <Outlet context={{ audiences }} />
    </div>
  );
}
