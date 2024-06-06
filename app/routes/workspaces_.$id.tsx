import {
  json,
  redirect,
  useLoaderData,
  useNavigate,
  Outlet,
  Link,
} from "@remix-run/react";
import { useState, useEffect, useMemo, useCallback } from "react";
import { PlusIcon } from "~/components/Icons";
import { WorkspaceDropdown } from "~/components/WorkspaceDropdown";
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

export const loader = async ({ request, params }) => {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const workspaceId = params.id;
  const selected = params.selected || "campaigns";
  if (!selected) return redirect("campaigns", { headers });
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
  const { data: audiences } = await getWorkspaceAudiences({
    supabaseClient,
    workspaceId,
  });
  const { data: campaigns } = await getWorkspaceCampaigns({
    supabaseClient,
    workspaceId,
  });
  const { data: contacts } = await getWorkspaceContacts({
    supabaseClient,
    workspaceId,
  });

  return json(
    { workspace, audiences, campaigns, contacts, selected },
    { headers },
  );
};

export default function Workspace() {
  const navigate = useNavigate();
  const {
    workspace,
    audiences,
    campaigns,
    contacts,
    selected = "campaigns",
  } = useLoaderData();
  const tables = useMemo(
    () => [
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
    ],
    [audiences, campaigns, contacts],
  );

  const getTableByName = useCallback(
    (name: string) => {
      const foundTable = tables.find((table) => table.name === name);
      console.log(name, tables, foundTable);
      return foundTable;
    },
    [tables],
  );

  const selectedTable = useMemo(() => {
    return getTableByName(selected);
  }, [getTableByName, selected]);

  const handleSelectTable = (tableName: string) => {
    const table = getTableByName(tableName);
    if (table) {
      setSelectedTable(table);
      navigate(`${tableName}`);
    } else {
      console.error(
        `tableName: ${tableName} does not correspond to any workspace tables`,
      );
    }
  };

  const setSelectedTable = (newTable: object) => {
    navigate(`${newTable.name}`);
  };
  return (
    <main className="mx-auto mt-8 h-full w-[80%] items-center">
      <div className="flex items-center">
        <div className="w-60">
          <WorkspaceDropdown selectTable={handleSelectTable} selectedTable={selected} tables={tables}/>
        </div>
{/*         <div
          className="flex gap-4 px-4 font-Zilla-Slab text-xl font-bold"
          id="filter-controls"
        >
          <p>Filter Controls</p>
          <input type="text" name="filter-input" id="filter-input" />
        </div> */}
      </div>
      <div className="flex">
        <div className="flex h-[800px] w-60 min-w-60 flex-col overflow-scroll border-2 border-solid border-slate-800 bg-cyan-50">
          {selectedTable?.data?.map((row) => (
            <Link
              to={`${selectedTable.name}/${row.id}`}
              key={row.id}
              className="border-b-2 border-solid border-slate-500 p-2 text-brand-primary hover:bg-slate-300 hover:text-slate-800"
            >
              <h3 className="capitalize">
                {selectedTable.name === "campaigns"
                  ? row.title
                  : selectedTable.name === "audiences"
                    ? row.name || `${selectedTable?.name} ${row.id}`
                    : selectedTable.name === "contacts"
                      ? `${row.firstname} ${row.surname}`
                      : ""}
              </h3>
            </Link>
          ))}
          <Link
            to={`${selectedTable?.name}/new`}
            className="flex justify-center p-4"
          >
            <PlusIcon fill="#333" width="25px" />
          </Link>
        </div>
        <div className="min-h-3/4 flex w-full flex-auto border-2 border-l-0 border-solid border-slate-800">
          <div className="flex flex-auto flex-col">
            <Outlet
              context={{
                selectedTable,
                audiences,
                campaigns,
                contacts,
              }}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
