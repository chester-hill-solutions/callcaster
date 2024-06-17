import { LoaderFunctionArgs } from "@remix-run/node";
import {
  Link,
  Outlet,
  json,
  useLoaderData,
  useNavigate,
} from "@remix-run/react";
import { mediaColumns } from "~/components/Media/columns";
import WorkspaceNav from "~/components/Workspace/WorkspaceNav";
import { DataTable } from "~/components/WorkspaceTable/DataTable";
import { audienceColumns } from "~/components/WorkspaceTable/columns";
import { Button } from "~/components/ui/button";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const workspaceId = params.id;
  if (workspaceId == null) {
    return json(
      { workspace: null, error: "Workspace does not exist" },
      { headers },
    );
  }

  const { data: workspaceData, error: workspaceError } = await supabaseClient
    .from("workspace")
    .select()
    .eq("id", workspaceId)
    .single();

  const { data: audienceData, error: audienceError } = await supabaseClient
    .from("audience")
    .select()
    .eq("workspace", workspaceId);

  if (workspaceError) {
    return json(
      { workspace: null, error: workspaceError.message },
      { headers },
    );
  }

  return json(
    { audienceData, workspace: workspaceData, error: null },
    { headers },
  );
}

export default function AudienceChart() {
  const { audienceData, workspace, error } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  //   const actionData = useActionData<typeof action>();

  const isWorkspaceAudioEmpty = error === "No contacts on the Audience";

  return (
    <main className="mx-auto mt-8 flex h-full w-[80%] flex-col gap-4 rounded-sm text-white">
      <WorkspaceNav workspace={workspace} isInChildRoute={true} />
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-Zilla-Slab text-3xl font-bold text-brand-primary dark:text-white">
          {workspace != null ? `${workspace?.name} Audiences` : "No Workspace"}
        </h1>
        <div className="flex items-center gap-4">
          <Button asChild className="font-Zilla-Slab text-xl font-semibold">
            <Link to={`./new`}>Add Audience</Link>
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

      {audienceData != null ? (
        <DataTable
          className="rounded-md border-2 font-semibold text-gray-700 dark:border-white dark:text-white"
          columns={audienceColumns}
          data={audienceData}
          onRowClick={(item) => navigate(`${item?.id}`)}
        />
      ) : (
        <h4 className="py-16 text-center font-Zilla-Slab text-4xl font-bold text-black dark:text-white">
          Add An Audience To This Workspace
        </h4>
      )}
    </main>
  );
}
