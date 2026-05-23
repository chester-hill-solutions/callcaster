export { loader } from "./scripts.loader.server";
export { action } from "./scripts.action.server";

import { data as routeData, ActionFunctionArgs, LoaderFunctionArgs, Form, Link, NavLink, useActionData, useLoaderData } from "react-router";
import { MdDownload, MdEdit } from "react-icons/md";
import { DataTable } from "@/components/workspace/tables/DataTable";
import { Button } from "@/components/ui/button";


import { formatDateToLocale } from "@/lib/utils";
import { useEffect } from "react";
import type { PostgrestError , SupabaseClient } from "@supabase/supabase-js";

import type { Json , Database } from "@/lib/database.types";
import type { User } from "@/lib/types";

export default function WorkspaceScripts() {
  const loaderData = useLoaderData<LoaderData>();
  const actionData = useActionData();

  // Narrow the type of loaderData
  const { error } = loaderData;
  // const workspace = 'workspace' in loaderData ? loaderData.workspace : null;
  const rawScripts = 'scripts' in loaderData ? loaderData.scripts : null;

  // Parse the steps for each script
  const scripts = rawScripts?.map(script => ({
    ...script,
    steps: typeof script.steps === 'string' ? JSON.parse(script.steps) : script.steps
  })) ?? null;

  useEffect(() => {
    if (actionData && 'fileContent' in actionData) {
      const blob = new Blob([actionData.fileContent], {
        type: actionData.contentType,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", actionData.fileName);
      document.body.appendChild(link);
      link.click();
      if (link.parentNode) {
        link.parentNode.removeChild(link);
      }
    }
  }, [actionData]);

  const isWorkspaceAudioEmpty = !scripts || scripts.length === 0;

  return (
    <main className="flex h-full flex-col gap-4 rounded-sm ">
      <div className="flex flex-col sm:flex-row sm:justify-between">
      <div className="flex">
        </div>
        <Button asChild className="font-Zilla-Slab text-lg font-semibold">
            <Link to={`./new`}>Add a Script</Link>
          </Button>
      </div>
      {error && !isWorkspaceAudioEmpty && (
        <h4 className="text-center font-Zilla-Slab text-4xl font-bold text-red-500">
          {error}
        </h4>
      )}
      {isWorkspaceAudioEmpty && (
        <h4 className="py-16 text-center font-Zilla-Slab text-2xl font-bold text-black dark:text-white">
          Add Your Own Scripts to this Workspace!
        </h4>
      )}

      {scripts && scripts.length > 0 && (
        <DataTable
          className="rounded-md border-2 font-semibold text-gray-700 dark:border-white dark:text-white"
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
                  <Form method="POST">
                    <input hidden value={script.id} name="id" id="id" />
                    <Button variant="ghost" type="submit">
                      <MdDownload />
                    </Button>
                  </Form>
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
      )}
    </main>
  );
}
