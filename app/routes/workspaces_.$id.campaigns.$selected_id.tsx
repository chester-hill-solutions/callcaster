import { defer, json, redirect } from "@remix-run/node";
import {
  Await,
  NavLink,
  Outlet,
  useActionData,
  useLoaderData,
  useLocation,
  useOutletContext,
  useSubmit,
} from "@remix-run/react";
import { Suspense, useEffect } from "react";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

import {
  fetchBasicResults,
  fetchCampaignData,
  fetchCampaignDetails,
  getUserRole,
} from "~/lib/database.server";
import { MemberRole } from "~/components/Workspace/TeamMember";
import ResultsScreen from "~/components/ResultsScreen";
import MessageResultsScreen from "~/components/MessageResultsScreen";
import { Button } from "~/components/ui/button";
import { TotalCalls } from "~/components/ResultsScreen.TotalCalls";
import { MdCampaign } from "react-icons/md";

export const action = async ({ request, params }) => {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession?.user) {
    return redirect("/signin");
  }
  const { data, error } = await supabaseClient.rpc(
    "get_dynamic_outreach_results",
    { campaign_id_param: params.selected_id },
  );

  if (error) {
    console.error("Error fetching data:", error);
    return new Response("Error fetching data", { status: 500 });
  }

  if (!data || data.length === 0) {
    return new Response("No data found", { status: 404 });
  }

  const dynamicKeys = new Set();
  data.forEach((row) => {
    if (row.dynamic_columns) {
      Object.keys(row.dynamic_columns).forEach((key) => dynamicKeys.add(key));
    }
  });
  const escapeCSV = (field) => {
    if (field == null) return "";
    return `"${String(field).replace(/"/g, '""')}"`;
  };

  const csvHeaders = [
    "external_id",
    "disposition",
    "call_duration",
    "firstname",
    "surname",
    "phone",
    "username",
    "created_at",
    ...Array.from(dynamicKeys),
  ];
  let csvContent = csvHeaders.map(escapeCSV).join(",") + "\n";

  data.forEach((row) => {
    let callDuration = row.call_duration;
    if (!callDuration || callDuration.startsWith("-")) {
      callDuration = "00:00:00";
    }

    const csvRow = [
      row.external_id,
      row.disposition,
      callDuration,
      row.firstname,
      row.surname,
      row.phone,
      row.username,
      row.created_at,
      ...Array.from(dynamicKeys).map((key) =>
        row.dynamic_columns ? row.dynamic_columns[key] : "",
      ),
    ]
      .map(escapeCSV)
      .join(",");
    csvContent += csvRow + "\n";
  });

  return json({
    csvContent,
    filename: `outreach_results_${params.selected_id}.csv`,
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

function handleNavlinkStyles(isActive: boolean, isPending: boolean): string {
  if (isActive) {
    return "rounded-md border-2 border-brand-secondary bg-brand-secondary px-2 py-1 font-Zilla-Slab text-sm font-semibold text-black transition-colors duration-150 ease-in-out dark:text-black";
  }

  if (isPending) {
    return "rounded-md bg-brand-tertiary border-2 border-zinc-400 px-2 py-1 font-Zilla-Slab text-sm font-semibold text-black transition-colors duration-150 ease-in-out dark:text-white";
  }

  return "rounded-md border-2 border-zinc-400 px-2 py-1 font-Zilla-Slab text-sm font-semibold text-black transition-colors duration-150 ease-in-out hover:bg-zinc-100 dark:text-white";
}

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

  const startCampaign = (submit, campaign_id, user_id) => {
    submit(
      { campaign_id, user_id },
      {
        action: "/api/initiate-ivr",
        method: "POST",
        navigate: false,
        encType: "application/json",
      },
    );
  };

  useEffect(() => {
    if (csvData && csvData.csvContent) {
      const blob = new Blob([csvData.csvContent], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = csvData.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }
  }, [csvData]);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="mt-2 flex justify-center gap-2 sm:hidden">
        <NavLink
          className={({ isActive, isPending }) =>
            `text-zinc-800 hover:text-brand-primary`
          }
          to="."
          relative="path"
          end
        >
          <h3 className="font-Zilla-Slab text-2xl font-semibold">
            {data?.title}
          </h3>
        </NavLink>
      </div>
      <div className="flex items-center justify-center border-b-2 border-zinc-300 p-4 sm:justify-between">
        <div className="mt-2 hidden justify-center gap-2 rounded-xl border-2 border-zinc-900 p-2 hover:border-brand-primary sm:flex">
          <NavLink
            className={({ isActive, isPending }) =>
              `flex items-center gap-2 text-zinc-800 hover:text-brand-primary`
            }
            to="."
            relative="path"
            end
          >
            <MdCampaign size={18} className="" />
            <h3 className="font-Zilla-Slab text-2xl font-semibold">
              {data?.title}
            </h3>
          </NavLink>
        </div>
        <div className="flex gap-2">
          <NavLink
            className={({ isActive, isPending }) =>
              handleNavlinkStyles(isActive, isPending)
            }
            to="script"
            relative="path"
          >
            Script
          </NavLink>

          {hasAccess && (
            <NavLink
              className={({ isActive, isPending }) =>
                handleNavlinkStyles(isActive, isPending)
              }
              to="settings"
              relative="path"
            >
              Settings
            </NavLink>
          )}
          {data.type === "live_call" ? (
            <NavLink
              className={({ isActive, isPending }) =>
                handleNavlinkStyles(isActive, isPending)
              }
              to={`call`}
              relative="path"
            >
              Join Campaign
            </NavLink>
          ) : (
            <div></div>
          )}
        </div>
      </div>
      {hasAccess && isCampaignParentRoute && (
        <Suspense fallback={<LoadingResults />}>
          <Await resolve={results} errorElement={<ErrorLoadingResults />}>
            {(resolvedResults) => (
              <>
                {resolvedResults.length < 1 ? (
                  <NoResultsYet campaign={data} user={user} submit={submit} />
                ) : (
                  <ResultsDisplay
                    results={resolvedResults}
                    campaign={data}
                    hasAccess={hasAccess}
                    user={user}
                  />
                )}
              </>
            )}
          </Await>
        </Suspense>
      )}
      {isCampaignParentRoute &&
        !hasAccess &&
        (campaign.type === "live_call" || !campaign.type) && (
          <div className="flex">
            <div className="flex min-w-[200px] flex-auto p-4">
              <TotalCalls
                totalCalls={totalCalls}
                expectedTotal={expectedTotal}
              />
            </div>
            <div className="p-4">
              <div className="max-w-50 flex flex-col">
                <h3 className="my-4 font-Zilla-Slab text-xl">
                  {campaign.instructions?.join ||
                    "Join the campaign and start dialing!"}
                </h3>
                <div>
                  <NavLink
                    className="rounded-md border-2 border-brand-primary bg-brand-primary px-2 py-1 font-Zilla-Slab text-xl font-semibold text-white transition-colors duration-150 ease-in-out dark:text-white"
                    to={`${data.dial_type || "call"}`}
                    relative="path"
                  >
                    Join Campaign
                  </NavLink>
                </div>
              </div>
              <div className="my-4 flex flex-col">
                <h3 className="my-4 font-Zilla-Slab text-xl">
                  {campaign.instructions?.script ||
                    "Preview the Script and familiarize yourself before dialing."}
                </h3>
                <div>
                  <NavLink
                    className="rounded-md border-2 border-brand-primary bg-brand-primary px-2 py-1 font-Zilla-Slab text-xl font-semibold text-white transition-colors duration-150 ease-in-out dark:text-white"
                    to="script"
                    relative="path"
                  >
                    View Script
                  </NavLink>
                </div>
              </div>
            </div>
          </div>
        )}
      <Outlet context={{ audiences }} />
    </div>
  );
}
function LoadingResults() {
  return <div>Loading results...</div>;
}

function ErrorLoadingResults() {
  return <div>Error loading results. Please try again.</div>;
}

function NoResultsYet({ campaign, user, submit }) {
  return (
    <div className="mt-8 flex flex-auto items-center justify-center gap-2 sm:flex-col">
      {campaign.type !== "live_call" && (
        <Button onClick={() => startCampaign(submit, campaign.id, user.id)}>
          Start Campaign
        </Button>
      )}
      <h1 className="font-Zilla-Slab text-4xl text-gray-400">
        Your Campaign Results Will Show Here
      </h1>
    </div>
  );
}

function ResultsDisplay({ results, campaign, hasAccess, user }) {
  const totalCalls = results.reduce((sum, item) => sum + item.count, 0);
  const expectedTotal = results[0]?.expected_total || 0;

  return campaign.type === "message" ? (
    <MessageResultsScreen
      totalCalls={totalCalls}
      results={results}
      expectedTotal={expectedTotal}
      type={campaign.type}
      dial_type={campaign.dial_type}
      handleNavlinkStyles={handleNavlinkStyles}
      hasAccess={hasAccess}
    />
  ) : (
    <ResultsScreen
      totalCalls={totalCalls}
      results={results}
      expectedTotal={expectedTotal}
      type={campaign.type}
      dial_type={campaign.dial_type}
      handleNavlinkStyles={handleNavlinkStyles}
      hasAccess={hasAccess}
      campaign_id={campaign.id || campaign.campaignDetails?.campaign_id}
      user_id={user}
    />
  );
}
