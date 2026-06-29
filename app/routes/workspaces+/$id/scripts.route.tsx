export { loader } from "./scripts.loader.server";
export { action } from "./scripts.action.server";

import { data as routeData, ActionFunctionArgs, LoaderFunctionArgs, Link, NavLink, Outlet, useLoaderData, useOutlet, useOutletContext } from "react-router";
import type { ContextType } from "@/lib/types";
import { MdDownload, MdEdit } from "react-icons/md";
import { DataTable } from "@/components/workspace/tables/DataTable";
import { WorkspaceResourceListShell } from "@/components/workspace/WorkspaceResourceListShell";
import { Button } from "@/components/ui/button";


import { formatDateToLocale } from "@/lib/utils";
import { downloadBlobPart } from "@/lib/download-blob.client";
import { useFetcher } from "react-router";
import { useActionFeedback } from "@/hooks/utils/useActionFeedback";
import type { PostgrestError , SupabaseClient } from "@supabase/supabase-js";

import type { Json , Database } from "@/lib/database.types";
import type { User } from "@/lib/types";

type ScriptSteps = {
  pages?: Record<string, unknown>;
  blocks?: Record<string, unknown>;
};

type Script = {
  id: number;
  name: string;
  created_at: string;
  created_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
  workspace: string | null;
  type: string | null;
  steps: Json;
};

type ScriptWithParsedSteps = Omit<Script, 'steps'> & {
  steps: ScriptSteps | null;
};

type Workspace = {
  id: string;
  name: string;
};

type LoaderData =
  | {
      scripts: null;
      error: string;
      userRole: Database["public"]["Enums"]["workspace_role"] | null;
      workspace?: undefined;
    }
  | {
      scripts: Script[] | null;
      workspace: Workspace | null;
      error: null;
      userRole: Database["public"]["Enums"]["workspace_role"];
    };

// ActionData inferred from action's return via typeof action

export default function WorkspaceScripts() {
  const outlet = useOutlet();
  const parentContext = useOutletContext<ContextType>();
  const loaderData = useLoaderData<LoaderData>();

  if (outlet) {
    return <Outlet context={parentContext} />;
  }
  const downloadFetcher = useFetcher<{
    fileContent?: string;
    contentType?: string;
    fileName?: string;
  }>();

  // Narrow the type of loaderData
  const { error } = loaderData;
  // const workspace = 'workspace' in loaderData ? loaderData.workspace : null;
  const rawScripts = 'scripts' in loaderData ? loaderData.scripts : null;

  // Parse the steps for each script
  const scripts = rawScripts?.map(script => ({
    ...script,
    steps: typeof script.steps === 'string' ? JSON.parse(script.steps) : script.steps
  })) ?? null;

  useActionFeedback(
    downloadFetcher.state === "idle" ? downloadFetcher.data : undefined,
    {
      getSuccess: (data) =>
        data != null && "fileContent" in data && Boolean(data.fileContent),
      onSuccess: (data) => {
        if (!data?.fileContent || !data.fileName) {
          return;
        }
        downloadBlobPart({
          data: data.fileContent,
          filename: data.fileName,
          mimeType: data.contentType ?? "application/json",
        });
      },
      successMessage: undefined,
    },
  );

  const workspace = "workspace" in loaderData ? loaderData.workspace : null;
  const isWorkspaceAudioEmpty = !scripts || scripts.length === 0;
  const title = "Scripts";

  return (
    <WorkspaceResourceListShell
      title={title}
      error={error}
      isEmpty={isWorkspaceAudioEmpty}
      emptyMessage="Add Your Own Scripts to this Workspace!"
      addAction={
        <Button asChild className="font-Zilla-Slab text-lg font-semibold">
          <Link to="./new">Add a Script</Link>
        </Button>
      }
    >
      {scripts && scripts.length > 0 ? (
        <DataTable
          className="font-semibold text-foreground"
          columns={[
            {
              accessorKey: "name",
              header: "Name",
            },
            {
              accessorKey: "created_at",
              header: "Created",
              cell: ({ row }) => {
                const formatted = formatDateToLocale(
                  row.getValue("created_at"),
                );
                return <div className="">{formatted.split(",")[0]}</div>;
              },
            },
            {
              header: "Details",
              cell: ({ row }) => {
                const script = row.original as ScriptWithParsedSteps;
                const sectionCount = Object.values(
                  script.steps?.pages || {},
                ).length;
                const blocksCount = Object.values(
                  script.steps?.blocks || {},
                ).length;
                return (
                  <div>
                    <div>
                      {sectionCount} section{sectionCount !== 1 && `s`}
                    </div>
                    <div>
                      {blocksCount} block{blocksCount !== 1 && `s`}
                    </div>
                  </div>
                );
              },
            },
            {
              header: "Download",
              cell: ({ row }) => {
                const script = row.original as ScriptWithParsedSteps;
                return (
                  <Button
                    variant="ghost"
                    type="button"
                    disabled={downloadFetcher.state !== "idle"}
                    onClick={() => {
                      downloadFetcher.submit(
                        { id: String(script.id) },
                        { method: "post" },
                      );
                    }}
                  >
                    <MdDownload />
                  </Button>
                );
              },
            },
            {
              header: "Edit",
              cell: ({ row }) => {
                const script = row.original as ScriptWithParsedSteps;
                return (
                  <Button variant="ghost" asChild>
                    <NavLink to={`./${script.id}`} relative="path">
                      <MdEdit />
                    </NavLink>
                  </Button>
                );
              },
            },
          ]}
          data={scripts}
        />
      ) : null}
    </WorkspaceResourceListShell>
  );
}
