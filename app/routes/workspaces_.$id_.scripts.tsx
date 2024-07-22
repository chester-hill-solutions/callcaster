import {
  ActionFunctionArgs,
  createReadableStreamFromReadable,
  LoaderFunctionArgs,
} from "@remix-run/node";
import { Form, Link, NavLink, json, useActionData, useLoaderData } from "@remix-run/react";
import { MdDownload, MdEdit } from "react-icons/md";
import { Readable } from "node:stream";
import WorkspaceNav from "~/components/Workspace/WorkspaceNav";
import { DataTable } from "~/components/WorkspaceTable/DataTable";
import { Button } from "~/components/ui/button";
import { getUserRole } from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { formatDateToLocale } from "~/lib/utils";
import { useEffect } from "react";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const workspaceId = params.id;
  if (workspaceId == null) {
    return json(
      {
        audioMedia: null,
        workspace: null,
        error: "Workspace does not exist",
        userRole: null,
      },
      { headers },
    );
  }

  const userRole = getUserRole({ serverSession, workspaceId });
  const { data: workspace, error: workspaceError } = await supabaseClient
    .from("workspace")
    .select()
    .eq("id", workspaceId)
    .single();

  const { data: scripts, error: scriptsError } = await supabaseClient
    .from("script")
    .select()
    .eq("workspace", workspaceId);

  if ([scriptsError, workspaceError].filter(Boolean).length) {
    return json(
      {
        scripts: null,
        error: [scriptsError, workspaceError]
          .filter(Boolean)
          .map((error) => error.message)
          .join(", "),
        userRole,
      },
      { headers },
    );
  }

  return json({ scripts, workspace, error: null, userRole }, { headers });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const formData = await request.formData();
  const data = Object.fromEntries(formData.entries());

  if (!data.id) {
    return json({ error: "Script ID is required" }, { status: 400 });
  }

  const { data: script, error: scriptError } = await supabaseClient
    .from("script")
    .select("name, steps")
    .eq("id", data.id)
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
export default function WorkspaceAudio() {
  const { scripts, error, userRole, workspace } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  useEffect(() => {
    if (actionData) {
        console.log(actionData)
      const blob = new Blob([actionData.fileContent], { type: actionData.contentType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", actionData.fileName);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
    }
  }, [actionData]);

  const isWorkspaceAudioEmpty = !scripts?.length > 0;
  return (
    <main className="mx-auto mt-8 flex h-full w-[80%] flex-col gap-4 rounded-sm text-white">
      <WorkspaceNav
        workspace={workspace}
        isInChildRoute={true}
        userRole={userRole}
      />
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-Zilla-Slab text-3xl font-bold text-brand-primary dark:text-white">
          {workspace != null
            ? `${workspace?.name} Audio Library`
            : "No Workspace"}
        </h1>
        <div className="flex items-center gap-4">
          <Button asChild className="font-Zilla-Slab text-xl font-semibold">
            <Link to={`./new`}>Add a Script</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="border-0 border-black bg-zinc-600 font-Zilla-Slab text-xl font-semibold text-white hover:bg-zinc-300 dark:border-white"
          >
            <Link to=".." relative="path">
              Back
            </Link>
          </Button>
        </div>
      </div>
      {error && !isWorkspaceAudioEmpty && (
        <h4 className="text-center font-Zilla-Slab text-4xl font-bold text-red-500">
          {error}
        </h4>
      )}
      {isWorkspaceAudioEmpty && (
        <h4 className="py-16 text-center font-Zilla-Slab text-4xl font-bold text-black dark:text-white">
          Add Your Own Scripts to this Workspace!
        </h4>
      )}

      {scripts != null && (
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
                const sectionCount = Object.values(
                  row.original.steps?.pages || {},
                ).length;
                const blocksCount = Object.values(
                  row.original.steps?.blocks || {},
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
                const id = row.original.id;
                return (
                  <Form method="POST">
                    <input hidden value={id} name="id" id="id" />
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
                const id = row.original.id;
                return (
                  <Button variant="ghost" asChild>
                    <NavLink to={`./${id}`} relative="path">
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
