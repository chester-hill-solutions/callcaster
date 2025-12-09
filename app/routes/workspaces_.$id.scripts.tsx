import { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  Form,
  Link,
  NavLink,
  json,
  useActionData,
  useLoaderData,
} from "@remix-run/react";
import { MdDownload, MdEdit } from "react-icons/md";
import { DataTable } from "@/components/workspace/WorkspaceTable/DataTable";
import { Button } from "@/components/ui/button";
import { getUserRole } from "@/lib/database.server";
import { verifyAuth } from "@/lib/supabase.server";
import { formatDateToLocale } from "@/lib/utils";
import { useEffect } from "react";
import type { PostgrestError } from "@supabase/supabase-js";
import { Json } from "@/lib/supabase.types";
import { User } from "@/lib/types";
import { SupabaseClient } from "@supabase/supabase-js";

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
  | { workspace: null; error: string; userRole: null; scripts?: undefined }
  | { scripts: null; error: string; userRole: any; workspace?: undefined }
  | { scripts: Script[] | null; workspace: Workspace | null; error: null; userRole: any };

type ActionData = 
  | { error: string }
  | { fileContent: string; fileName: string; contentType: string };

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, headers, user } = await verifyAuth(request);

  const workspaceId = params.id;
  if (workspaceId == null) {
    return json<LoaderData>(
      {
        workspace: null,
        error: "Workspace does not exist",
        userRole: null,
      },
      { headers },
    );
  }

  const userRole = await getUserRole({ supabaseClient: supabaseClient as SupabaseClient, user: user as unknown as User, workspaceId: workspaceId as string });
  const { data: workspace, error: workspaceError } = await supabaseClient
    .from("workspace")
    .select()
    .eq("id", workspaceId)
    .single();

  const { data: scripts, error: scriptsError } = await supabaseClient
    .from("script")
    .select()
    .eq("workspace", workspaceId);

  if (scriptsError || workspaceError) {
    const errorMessage = [scriptsError, workspaceError]
      .filter((e): e is PostgrestError => e !== null)
      .map((error) => error.message)
      .join(", ");

    return json<LoaderData>(
      {
        scripts: null,
        error: errorMessage,
        userRole,
      },
      { headers },
    );
  }

  return json<LoaderData>(
    { scripts, workspace, error: null, userRole },
    { headers },
  );
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { supabaseClient, headers, user } = await verifyAuth(request);

  const formData = await request.formData();
  const data = Object.fromEntries(formData.entries());

  if (!data.id) {
    return json({ error: "Script ID is required" }, { status: 400 });
  }

  const { data: script, error: scriptError } = await supabaseClient
    .from("script")
    .select("name, steps")
    .eq("id", Number(data.id) || 0)
    .single();

  if (scriptError) {
    console.error("Error fetching script:", scriptError);
    return json({ error: "Error fetching script" }, { status: 500 });
  }

  if (!script) {
    return json({ error: "Script not found" }, { status: 404 });
  }

  const scriptJson = JSON.stringify(script.steps, null, 2);

  const fileName = script.name
    ? `${script.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.json`
    : `callcaster_script_${new Date().toISOString().split("T")[0]}.json`;

  return json(
    {
      fileContent: scriptJson,
      fileName: fileName,
      contentType: "application/json",
    },
    {
      headers: {
        ...headers,
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Type": "application/json",
      },
    },
  );
}

export default function WorkspaceScripts() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  // Narrow the type of loaderData
  const { error, userRole } = loaderData;
  const workspace = 'workspace' in loaderData ? loaderData.workspace : null;
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
