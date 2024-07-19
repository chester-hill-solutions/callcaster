import { LoaderFunctionArgs } from "@remix-run/node";
import {
  Link,
  NavLink,
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
import { getUserRole } from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const workspaceId = params.id;
  if (workspaceId == null) {
    return json(
      { workspace: null, error: "Workspace does not exist", userRole: null },
      { headers },
    );
  }

  const userRole = getUserRole({ serverSession, workspaceId });

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
      { workspace: null, error: workspaceError.message, userRole },
      { headers },
    );
  }

  return json(
    { audienceData, workspace: workspaceData, error: null, userRole },
    { headers },
  );
}

export default function AudienceChart() {
  const { audienceData, workspace, error, userRole } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  //   const actionData = useActionData<typeof action>();

  const isWorkspaceAudioEmpty = error === "No contacts on the Audience";

  return (
    <main className="mx-auto mt-8 flex h-full w-[80%] flex-col gap-4 rounded-sm text-white">
      <WorkspaceNav
        workspace={workspace}
        userRole={userRole}
      />
      <div className="flex flex-col sm:flex-row sm:justify-between">
        <div className="flex">
          <h1 className="mb-4 text-center font-Zilla-Slab text-2xl font-bold text-brand-primary dark:text-white">
            {workspace != null
              ? `${workspace?.name} Audiences`
              : "No Workspace"}
          </h1>
        </div>
        <div className="flex items-center justify-evenly gap-4">
          <Button asChild className="font-Zilla-Slab text-lg font-semibold">
            <NavLink to={`./new`}>Add Audience</NavLink>
          </Button>
          <Button asChild className="font-Zilla-Slab text-lg font-semibold" variant={"secondary"}>
            <NavLink to={`../contacts`} relative="path">Contacts</NavLink>
          </Button>
          <Button
            asChild
            variant="outline"
            className="border-0 border-black bg-zinc-600 font-Zilla-Slab text-lg font-semibold text-white hover:bg-zinc-300 dark:border-white"
          >
            <NavLink to=".." relative="path">
              Back
            </NavLink>
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
