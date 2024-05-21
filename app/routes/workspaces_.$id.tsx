import { json, redirect, useLoaderData } from "@remix-run/react";
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

export const loader = async ({ request }: { request: Request }) => {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  if (!serverSession) {
    return redirect("/signin", { headers });
  }

  const workspaceId = request.url.split("/").at(-1);
  const { data: workspace } = await getWorkspaceInfo({
    supabaseClient,
    workspaceId,
  });

  const { data: audiences } = await getWorkspaceAudiences({ supabaseClient });
  const { data: campaigns } = await getWorkspaceCampaigns({ supabaseClient });
  const { data: contacts } = await getWorkspaceContacts({ supabaseClient });

  return json({ workspace, audiences, campaigns, contacts }, { headers });
};

export default function Workspace() {
  const { workspace, audiences, campaigns, contacts } =
    useLoaderData<typeof loader>();

  const [selectedTable, setSelectedTable] = useState<
    JsonifyObject<WorkspaceTable>
  >({
    columns: campaignColumns,
    data: campaigns,
  });

  const handleSelectTable = (tableName: string) => {
    switch (tableName) {
      case WorkspaceTableNames.Campaign:
        setSelectedTable({
          columns: campaignColumns,
          data: campaigns,
        });
        break;
      case WorkspaceTableNames.Audience:
        setSelectedTable({
          columns: audienceColumns,
          data: audiences,
        });
        break;
      case WorkspaceTableNames.Contact:
        setSelectedTable({
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
    <main className="mx-auto mt-8 flex h-full w-[80%] flex-col rounded-sm text-white">
      {/* <h1 className="text-center font-Tabac-Slab text-4xl font-black text-white">
        Workspace: {workspace?.name}
      </h1> */}
      <div id="table-selector" className="col-span-full flex items-center">
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
      </div>

      {campaigns != null && (
        <DataTable
          classname="border-white border-2 rounded-md"
          columns={selectedTable.columns}
          data={selectedTable.data}
        />
      )}
    </main>
  );
}
