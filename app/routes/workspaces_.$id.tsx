import { json, redirect, useLoaderData, useNavigate } from "@remix-run/react";

import { PostgrestError } from "@supabase/supabase-js";
import { useState } from "react";
import { WorkspaceDropdown } from "~/components/WorkspaceDropdown";
import { DataTable } from "~/components/WorkspaceTable/DataTable";
import {
  audienceColumns,
  campaignColumns,
  contactColumns,
} from "~/components/WorkspaceTable/columns";
import {
  getWorkspaceAudiences,
  getWorkspaceCampaigns,
  getWorkspaceContacts,
  getWorkspaceInfo,
} from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { WorkspaceTable, WorkspaceTableNames } from "~/lib/types";

export const loader = async ({ request, params }: { request: Request }) => {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const workspaceId = params.id
  const { data: workspace, error } = await getWorkspaceInfo({
    supabaseClient,
    workspaceId,
  });
  if (error) {
    console.log(error);
    if (error.code === "PGRST116") {
      return redirect("/workspaces", { headers });
    }
  }
  const { data: audiences } = await getWorkspaceAudiences({ supabaseClient, workspaceId });
  const { data: campaigns } = await getWorkspaceCampaigns({ supabaseClient, workspaceId });
  const { data: contacts } = await getWorkspaceContacts({ supabaseClient, workspaceId });

  return json({ workspace, audiences, campaigns, contacts }, { headers });
};

export default function Workspace() {
  const navigate = useNavigate();
  const { workspace, audiences, campaigns, contacts } =
    useLoaderData<typeof loader>();

  const [selectedTable, setSelectedTable] = useState<
    JsonifyObject<WorkspaceTable>
  >({
    name:'campaigns',
    columns: campaignColumns,
    data: campaigns,
  });

  const [firstColumn, setFirstColumn] = useState<(string | null)[]>(
    campaigns != null ? campaigns.map((campaign) => campaign.title) : [],
  );

  const handleSelectTable = (tableName: string) => {
    switch (tableName) {
      case WorkspaceTableNames.Campaign:
        setFirstColumn(
          campaigns != null ? campaigns.map((campaign) => campaign.title) : [],
        );
        setSelectedTable({
          name: 'campaigns',
          columns: campaignColumns,
          data: campaigns,
        });
        break;
      case WorkspaceTableNames.Audience:
        setFirstColumn(
          audiences != null ? audiences.map((audience) => audience.name) : [],
        );
        setSelectedTable({
          name: 'audiences',
          columns: audienceColumns,
          data: audiences,
        });
        break;
      case WorkspaceTableNames.Contact:
        setFirstColumn([]);
        setSelectedTable({
          name: 'contacts',
          columns: contactColumns,
          data: contacts,
        });
        break;
      default:
        console.log(
          `tableName: ${tableName} does not correspond to any workspace tables`,
        );
    }
  };

  return (
    <main
      className="mx-auto mt-8 h-full w-[80%] items-center rounded-sm"
    >
      <div className="py-4">
        <WorkspaceDropdown selectTable={handleSelectTable} />
      </div>
      <div
        className="flex gap-4 px-4 font-Zilla-Slab text-2xl font-bold"
        id="filter-controls"
      >
        <p>Filter Controls</p>
        <input type="text" name="filter-input" id="filter-input" />
      </div>
      <div className="self-start" id="name-column">
        <ul className="flex flex-col gap-4">
          {firstColumn.map((row, i) => (
            <li key={`${selectedTable}-row-${i}`} onClick={() => nav}>{row}</li>
          ))}
        </ul>
      </div>

      {campaigns != null && (
        <DataTable
          classname="border-white border-2 rounded-md"
          columns={selectedTable.columns}
          data={selectedTable.data}
          onRowClick={(item) => navigate(`${selectedTable.name}/${item.id}`)}
        />
      )}
    </main>
  );
}
