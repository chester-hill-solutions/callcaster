import {
  json,
  redirect,
  useLoaderData,
  useNavigate,
  Outlet,
  Link,
  useOutletContext,
} from "@remix-run/react";
import { useState, useEffect } from "react";
import { PlusIcon } from "~/components/Icons";
import { WorkspaceDropdown } from "~/components/WorkspaceDropdown";
import { audienceColumns, campaignColumns, contactColumns } from "~/components/WorkspaceTable/columns";
import {
  getWorkspaceAudiences,
  getWorkspaceCampaigns,
  getWorkspaceContacts,
  getWorkspaceInfo,
} from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { WorkspaceTable, WorkspaceTableNames } from "~/lib/types";

export const loader = async ({ request, params }) => {
  const { supabaseClient, headers, serverSession } = await getSupabaseServerClientWithSession(request);

  const workspaceId = params.id;
  const selected = params.selected || "campaigns";
  const { data: workspace, error } = await getWorkspaceInfo({ supabaseClient, workspaceId });
  if (error) {
    console.log(error);
    if (error.code === "PGRST116") {
      return redirect("/workspaces", { headers });
    }
  }
  const { data: audiences } = await getWorkspaceAudiences({ supabaseClient, workspaceId });
  const { data: campaigns } = await getWorkspaceCampaigns({ supabaseClient, workspaceId });
  const { data: contacts } = await getWorkspaceContacts({ supabaseClient, workspaceId });

  return json({ workspace, audiences, campaigns, contacts, selected }, { headers });
};

export default function Workspace() {
  const navigate = useNavigate();
  const { workspace, audiences, campaigns, contacts, selected } = useLoaderData();
  const tables = [
    {
      name: "campaigns",
      columns: campaignColumns,
      data: campaigns,
    },
    {
      name: "audiences",
      columns: audienceColumns,
      data: audiences,
    },
    {
      name: "contacts",
      columns: contactColumns,
      data: contacts,
    },
  ];


  const [selectedTable, setSelectedTable] = useState(() =>
    tables.find((table) => table.name === selected)
  );

  useEffect(() => {
    setSelectedTable(tables.find((table) => table.name === selected));
  }, [selected, audiences, campaigns, contacts]);

  const handleSelectTable = (tableName) => {
    let newTable;
    switch (tableName) {
      case WorkspaceTableNames.Campaign:
        newTable = {
          name: "campaigns",
          columns: campaignColumns,
          data: campaigns,
        };
        break;
      case WorkspaceTableNames.Audience:
        newTable = {
          name: "audiences",
          columns: audienceColumns,
          data: audiences,
        };
        break;
      case WorkspaceTableNames.Contact:
        newTable = {
          name: "contacts",
          columns: contactColumns,
          data: contacts,
        };
        break;
      default:
        console.log(`tableName: ${tableName} does not correspond to any workspace tables`);
        return;
    }
    setSelectedTable(newTable);
    navigate(`${newTable.name}`);
  };

  return (
    <main className="mx-auto mt-8 h-full w-[80%] items-center">
      <div className="flex items-center">
        <div className="w-60">
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
      <div className="flex">
        <div className="flex w-60 min-w-60 flex-col border-2 border-solid border-slate-800 bg-cyan-50 h-[800px] overflow-scroll">
          {selectedTable.data.map((row) => (
            <Link
              to={`${selectedTable.name}/${row.id}`}
              key={row.id}
              className="border-b-2 border-solid border-slate-500 p-2 text-brand-primary hover:bg-slate-300 hover:text-slate-800"
            >
              <h3 className="capitalize">
                {selectedTable.name === "campaigns"
                  ? row.title
                  : selectedTable.name === "audiences"
                  ? row.name || `${selectedTable.name} ${row.id}`
                  : selectedTable.name === "contacts"
                  ? `${row.firstname} ${row.surname}`
                  : ""}
              </h3>
            </Link>
          ))}
          <Link to={`${selectedTable.name}/new`} className="flex justify-center p-4">
            <PlusIcon fill="#333" width="25px" />
          </Link>
        </div>
        <Outlet context={{ selectedTable, audiences, campaigns, contacts }} />
      </div>
    </main>
  );
}
