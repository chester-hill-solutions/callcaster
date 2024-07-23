import { json, redirect } from "@remix-run/node";
import {
  NavLink,
  Outlet,
  useActionData,
  useLoaderData,
  useLocation,
  useOutletContext,
  useSubmit,
} from "@remix-run/react";
import { useEffect } from "react";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

import { getUserRole } from "~/lib/database.server";
import { MemberRole } from "~/components/Workspace/TeamMember";
import ResultsScreen from "~/components/ResultsScreen";
import MessageResultsScreen from "~/components/MessageResultsScreen";
import { Button } from "~/components/ui/button";
import { TotalCalls } from "~/components/ResultsScreen.TotalCalls";

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
  const { id: workspace_id, selected_id, selected } = params;

  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession?.user) {
    return redirect("/signin");
  }
  if (selected_id === "new") {
    const query = supabaseClient
      .from("campaign")
      .insert({ workspace: workspace_id })
      .select();
    const { data, error } = await query;
    if (error) {
      console.log(error);
      return redirect(`/workspaces/${workspace_id}`);
    }

    const { error: detailsError } = await supabaseClient
      .from("live_campaign")
      .insert({ campaign_id: data[0].id, workspace: workspace_id });
    return redirect(`/workspaces/${workspace_id}/campaign/${data[0].id}`);
  }
  const { data: results, error: resultsError } = await supabaseClient.rpc(
    "get_basic_results",
    { campaign_id_param: selected_id },
    { headers },
  );

  const { data: campaign, error: mtmError } = await supabaseClient
    .from("campaign")
    .select(
      `type,
        dial_type,
        title,
        campaign_audience(*)
        `,
    )
    .eq("id", selected_id);

  let data = [...campaign];
  if (data.length > 0 && data[0].type === "live_call") {
    const { data: campaignDetails, error: detailsError } = await supabaseClient
      .from("live_campaign")
      .select()
      .eq("campaign_id", selected_id)
      .single();
    if (detailsError) console.error(detailsError);

    data = data.map((item) => ({
      ...item,
      campaignDetails,
    }));
  }
  if (data.length > 0 && data[0].type === "message") {
    let campaignDetails;
    const { data: fetchCampaignDetails, error: detailsError } =
      await supabaseClient
        .from("message_campaign")
        .select()
        .eq("campaign_id", selected_id)
        .single();
    if (detailsError) {
      if (detailsError.code === "PGRST116") {
        const { data: newCampaign, error: newCampaignError } =
          await supabaseClient
            .from("message_campaign")
            .insert({ campaign_id: selected_id, workspace: workspace_id })
            .select()
            .single();
        if (newCampaignError) {
          console.error(newCampaignError);
        } else {
          campaignDetails = newCampaign;
        }
      } else {
        console.error(detailsError);
      }
    } else {
      campaignDetails = fetchCampaignDetails;
    }
    data = data.map((item) => ({
      ...item,
      campaignDetails,
    }));
  }
  if (
    data.length > 0 &&
    (data[0].type === "robocall" ||
      data[0].type === "simple_ivr" ||
      data[0].type === "complex_ivr")
  ) {
    let campaignDetails;
    const { data: fetchCampaignDetails, error: detailsError } =
      await supabaseClient
        .from("ivr_campaign")
        .select()
        .eq("campaign_id", selected_id)
        .single();
    if (detailsError) {
      if (detailsError.code === "PGRST116") {
        const { data: newCampaign, error: newCampaignError } =
          await supabaseClient
            .from("ivr_campaign")
            .insert({ campaign_id: selected_id, workspace: workspace_id })
            .select()
            .single();
        if (newCampaignError) {
          console.error(newCampaignError);
        } else {
          campaignDetails = newCampaign;
        }
      } else {
        console.error(detailsError);
      }
    } else {
      campaignDetails = fetchCampaignDetails;
    }
    data = data.map((item) => ({
      ...item,
      campaignDetails,
    }));
  }
  const userRole = getUserRole({ serverSession, workspaceId: workspace_id });
  const hasAccess =
    userRole === MemberRole.Owner || userRole === MemberRole.Admin;
  const totalCalls = results?.reduce((sum, item) => sum + item.count, 0);
  const expectedTotal = (results && results[0]?.expected_total) || 0;
  return json({
    data,
    hasAccess,
    results,
    totalCalls,
    expectedTotal,

    user: serverSession?.user,
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
    results = [],
    totalCalls = 0,
    expectedTotal = 0,

    user,
  } = useLoaderData<typeof loader>();
  const csvData = useActionData();
  const route = useLocation().pathname.split("/");
  const isCampaignParentRoute = !Number.isNaN(parseInt(route.at(-1)));
  const campaign = data.length ? data[0] : {};
  const submit = useSubmit()

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
            {data[0]?.title}
          </h3>
        </NavLink>
      </div>
      <div className="flex items-center sm:justify-between justify-center border-b-2 border-zinc-300 p-4">
      <div className="mt-2 hidden sm:flex justify-center gap-2 ">
        <NavLink
          className={({ isActive, isPending }) =>
            `text-zinc-800 hover:text-brand-primary`
          }
          to="."
          relative="path"
          end
        >
          <h3 className="font-Zilla-Slab text-2xl font-semibold">
            {data[0]?.title}
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
          {data[0].type === "live_call" ? (
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
      {hasAccess && isCampaignParentRoute && totalCalls < 1 ? (
        <div className="flex flex-auto items-center justify-center">
            {campaign.type !== "live_call" && (
              <Button
                onClick={() => startCampaign(submit, campaign.id, user.id)}
              >
                Start Campaign
              </Button>
            )}
          <h1 className="font-Zilla-Slab text-4xl text-gray-400">
            Your Campaign Results Will Show Here
          </h1>
        </div>
      ) : isCampaignParentRoute && hasAccess ? (
        campaign.type === "message" ? (
          <MessageResultsScreen
            {...{
              totalCalls,
              results,
              expectedTotal,
              type: campaign.type,
              dial_type: data[0].dial_type,
              handleNavlinkStyles,
              hasAccess,
            }}
          />
        ) : (
          hasAccess && (
            <ResultsScreen
              {...{
                totalCalls,
                results,
                expectedTotal,
                type: campaign.type,
                dial_type: data[0].dial_type,
                handleNavlinkStyles,
                hasAccess,
                campaign_id:
                  campaign.id || campaign.campaignDetails?.campaign_id,
                user_id: user,
              }}
            />
          )
        )
      ) : (
        isCampaignParentRoute &&
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
                    to={`${data[0].dial_type || "call"}`}
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
        )
      )}
      <Outlet context={{ audiences }} />
    </div>
  );
}
