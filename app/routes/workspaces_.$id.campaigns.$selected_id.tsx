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
  getUserRole,
  getWorkspaceUsers,
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

export const action = async ({ request, params }) => {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession?.user) {
    return redirect("/signin");
  }
  const { id: workspace_id, selected_id: campaign_id } = params;

  const { data: users, error: usersError } = await getWorkspaceUsers({
    supabaseClient,
    workspaceId: workspace_id,
  });

  if (usersError) {
    console.error("Error fetching users:", usersError);
    return new Response("Error fetching users", { status: 500 });
  }

  const { data, error } = await supabaseClient
    .from("outreach_attempt")
    .select(`*, contact(*)`)
    .eq("campaign_id", campaign_id);

  if (error) {
    console.error("Error fetching data:", error);
    return new Response("Error fetching data", { status: 500 });
  }

  if (!data || data.length === 0) {
    return new Response("No data found", { status: 404 });
  }

  const dynamicKeys = new Set();
  const resultKeys = new Set();
  const otherDataKeys = new Set();

  const getAllKeys = (obj, prefix = "", target = dynamicKeys) => {
    Object.keys(obj).forEach((key) => {
      if (
        typeof obj[key] === "object" &&
        obj[key] !== null &&
        !Array.isArray(obj[key])
      ) {
        getAllKeys(obj[key], `${prefix}${key}_`, target);
      } else {
        const fullKey = `${prefix}${key}`;
        if (target instanceof Set) {
          target.add(fullKey);
        } else if (typeof target === "object") {
          target[fullKey] = obj[key];
        }
      }
    });
  };

  data.forEach((row) => {
    getAllKeys(row);
    getAllKeys(row.contact, "contact_");

    if (row.result && typeof row.result === "object") {
      Object.keys(row.result).forEach((key) => resultKeys.add(key));
    }

    if (row.contact.other_data && Array.isArray(row.contact.other_data)) {
      row.contact.other_data.forEach((item, index) => {
        if (typeof item === "object") {
          Object.keys(item).forEach((key) =>
            otherDataKeys.add(`other_data_${index}_${key}`),
          );
        }
      });
    }
  });

  let csvHeaders = Array.from(dynamicKeys)
    .concat(Array.from(resultKeys))
    .concat(Array.from(otherDataKeys));

  csvHeaders = csvHeaders.map((header) =>
    header === "id"
      ? "attempt_id"
      : header === "contact_id"
        ? "callcaster_id"
        : header,
  );

  const escapeCSV = (field) => {
    if (field == null) return "";
    const stringField = String(field);
    if (/[",\n]/.test(stringField)) {
      return `"${stringField.replace(/"/g, '""')}"`;
    }
    return stringField;
  };

  const flattenedData = data.map((row) => {
    const flattenedRow = {};
    getAllKeys(row, "", flattenedRow);
    getAllKeys(row.contact, "contact_", flattenedRow);

    const user = users.find((user) => row.user_id === user.id);
    flattenedRow.user_id = user ? user.username : row.user_id;

    const resultObj =
      row.result && typeof row.result === "object" ? row.result : {};
    Object.keys(resultObj).forEach((key) => {
      flattenedRow[key] = resultObj[key];
    });

    if (row.contact.other_data && Array.isArray(row.contact.other_data)) {
      row.contact.other_data.forEach((item, index) => {
        if (typeof item === "object") {
          Object.keys(item).forEach((key) => {
            flattenedRow[`other_data_${index}_${key}`] = item[key];
          });
        }
      });
      delete flattenedRow.contact_other_data;
    }

    let callDuration = row.call_duration;
    if (!callDuration || callDuration.startsWith("-")) {
      callDuration = "00:00:00";
    }
    flattenedRow.call_duration = callDuration;

    if ("id" in flattenedRow) {
      flattenedRow.attempt_id = flattenedRow.id;
      delete flattenedRow.id;
    }
    if ("contact_id" in flattenedRow) {
      flattenedRow.callcaster_id = flattenedRow.contact_id;
      delete flattenedRow.contact_id;
    }

    return flattenedRow;
  });

  csvHeaders = csvHeaders.filter((header) =>
    flattenedData.some((row) => row[header] != null && row[header] !== ""),
  );

  let csvContent = "\ufeff"; // Add BOM for Excel to recognize UTF-8
  csvContent += csvHeaders.map(escapeCSV).join(",") + "\n";

  flattenedData.forEach((flattenedRow) => {
    const csvRow = csvHeaders
      .map((header) => escapeCSV(flattenedRow[header] || ""))
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
