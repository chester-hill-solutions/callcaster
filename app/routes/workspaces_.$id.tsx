import { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect, useLoaderData, useNavigate } from "@remix-run/react";
import { CSVLink } from "react-csv";
import { DataTable } from "~/components/WorkspaceTable/DataTable";
import { campaignColumns } from "~/components/WorkspaceTable/columns";
import { getWorkspaceCampaigns, getWorkspaceInfo } from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  if (!serverSession) {
    return redirect("/signin", { headers });
  }

  const workspaceId = params.id;
  if (workspaceId == null) {
    return json({ error: "Workspace does not exist" });
  }

  const { data: workspace, error: workspaceError } = await getWorkspaceInfo({
    supabaseClient,
    workspaceId,
  });

  const { data: campaigns, error: campaignsError } =
    await getWorkspaceCampaigns({
      supabaseClient,
      workspaceId,
    });

  if (campaigns == null) {
    return json({ error: "No campaigns found in workspace" });
  }

  for (const campaign of campaigns) {
    // console.log(`//////////////////// CAMPAIGN ${campaign.id} ////////////////////`,);
    const { data: contacts, error: contactError } = await supabaseClient.rpc(
      "get_contacts_by_campaign",
      { selected_campaign_id: campaign.id },
    );
    const { data: calls, error: callsError } = await supabaseClient.rpc(
      "get_calls_by_campaign",
      { selected_campaign_id: campaign.id },
    );

    let completedCalls = 0;
    let totalCalls = 0;

    for (const contact of contacts) {
      const calledContact = calls?.find(
        (call) => call.contact_id === contact.id,
      );

      // console.log(campaign.id,"     ",calledContact?.contact_id,calledContact?.status,);
      if (calledContact) {
        totalCalls += 1;
        if (calledContact.status === "completed") {
          completedCalls += 1;
        }
      }
    }
    const progress = completedCalls / totalCalls;
    campaign["progress"] = progress;
  }

  return json({ workspace, campaigns }, { headers });
};

export default function Workspace() {
  const { workspace, campaigns } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <main className="mx-auto mt-8 flex h-full w-[80%] flex-col gap-4 rounded-sm text-white">
      <div className="flex items-center gap-4">
        <h1 className="font-Zilla-Slab text-3xl font-bold text-brand-primary dark:text-white">
          {workspace.name}
        </h1>
        <CSVLink
          data={campaigns as object[]}
          className="rounded-md bg-brand-primary px-4 py-2 font-Zilla-Slab text-xl font-bold text-white hover:bg-brand-secondary"
        >
          Download
        </CSVLink>
      </div>
      {campaigns != null && (
        <DataTable
          className="rounded-md border-2 font-semibold text-gray-700 dark:border-white dark:text-white"
          columns={campaignColumns}
          data={campaigns}
          onRowClick={(item) => navigate(`campaigns/${item.id}`)}
        />
      )}
    </main>
  );
}
