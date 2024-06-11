import {
  Link,
  Outlet,
  json,
  redirect,
  useLoaderData,
  useNavigate,
} from "@remix-run/react";
import { useState, useEffect, useMemo, useCallback } from "react";
import { Toaster } from "sonner";
import { PlusIcon } from "~/components/Icons";
import { WorkspaceDropdown } from "~/components/WorkspaceDropdown";
import { WorkspaceTableNames } from "~/lib/types";
import {
  audienceColumns,
  campaignColumns,
  contactColumns,
} from "~/components/WorkspaceTable/columns";
import { Button } from "~/components/ui/button";
import { getWorkspaceCampaigns, getWorkspaceInfo } from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

export const loader = async ({ request, params }) => {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const workspaceId = params.id;
  const selected = params.selected;
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
  /* const { data: audiences } = await getWorkspaceAudiences({
     supabaseClient,
     workspaceId,
   }); */
  try {
    const { data: audiences, error: audiencesError } = await supabaseClient
      .from("audience")
      .select()
      .eq("workspace", workspaceId);
    if (audiencesError) throw { audiencesError };
    const { data: campaigns, error: campaignsError } =
      await getWorkspaceCampaigns({
        supabaseClient,
        workspaceId,
      });
    if (campaignsError) throw { campaignsError };
    const { data: contacts, error: contactsError } = await supabaseClient
      .from("contact")
      .select()
      .eq("workspace", workspaceId);
    if (contactsError) throw { contactsError };
    if (!selected) return redirect("campaigns", { headers });
    return json(
      { workspace, audiences, campaigns, contacts, selected },
      { headers },
    );
  } catch (error) {
    console.log(error);
    return json(error, 500);
  }
};

export default function Workspace() {
  const navigate = useNavigate();

  const { workspace, audiences, campaigns, contacts, selected } =
    useLoaderData();
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
    tables.find((table) => table.name === selected),
  );
  const handleSelectTable = (tableName: string) => {
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
        console.log(
          `tableName: ${tableName} does not correspond to any workspace tables`,
        );
        return;
    }
  };
  return (
    <main className="mx-auto mt-8 h-full w-[80%] items-center">
      <div className="flex items-center">
        <div className="w-60">
          <WorkspaceDropdown
            selectTable={handleSelectTable}
            selectedTable={selected}
            tables={tables}
          />
        </div>
        <div className="flex flex-1 justify-center">
          <h3 className="ml-auto font-Tabac-Slab text-2xl">
            {workspace?.name}
          </h3>
          <div className="ml-auto flex gap-4">
            <Button asChild variant="outline">
              <Link
                to={`./media`}
                relative="path"
                className="font-Zilla-Slab text-xl font-semibold"
              >
                Media
              </Link>
            </Button>
            <Button asChild>
              <Link
                to={`./settings`}
                relative="path"
                className="font-Zilla-Slab text-xl font-semibold"
              >
                Settings
              </Link>
            </Button>
          </div>
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
          {selectedTable?.data?.map((row, i) => (
            <Link
              to={`${selectedTable.name}/${row.id}`}
              key={row.id}
              className="border-b-2 border-solid border-slate-500 p-2 text-brand-primary hover:bg-slate-300 hover:text-slate-800"
            >
              <h3 className="capitalize">
                {selectedTable.name === "campaigns"
                  ? row.title || `Unnamed campaign ${i + 1}`
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
