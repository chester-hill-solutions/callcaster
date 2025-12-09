import { LoaderFunctionArgs } from "@remix-run/node";
import { Link, json, useLoaderData, useNavigate } from "@remix-run/react";
import { DataTable } from "@/components/workspace/WorkspaceTable/DataTable";
import { audienceColumns } from "@/components/workspace/WorkspaceTable/columns";
import { Button } from "@/components/ui/button";
import { getUserRole } from "@/lib/database.server";
import { verifyAuth } from "@/lib/supabase.server";
import { User } from "@/lib/types";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, headers, user } = await verifyAuth(request);

  const workspaceId = params.id;
  if (workspaceId == null) {
    return json(
      { workspace: null, error: "Workspace does not exist", userRole: null },
      { headers },
    );
  }

  const userRole = getUserRole({ supabaseClient, user: user as unknown as User, workspaceId });

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

  const isWorkspaceAudienceEmpty = !audienceData?.length;

  return (
    <main className="flex h-full flex-col gap-4 rounded-sm ">
      <div className="flex flex-col sm:flex-row sm:justify-between">
        <div className="flex">
          <h1 className="mb-4 text-center font-Zilla-Slab text-2xl font-bold text-brand-primary dark:text-white">
            {workspace != null
              ? `${workspace?.name} Audiences`
              : "No Workspace"}
          </h1>
        </div>
        <Button asChild className="font-Zilla-Slab text-lg font-semibold">
          <Link to={`./new`}>Add Audience</Link>
        </Button>
      </div>
      {error && !isWorkspaceAudienceEmpty && (
        <h4 className="text-center font-Zilla-Slab text-4xl font-bold text-red-500">
          {error}
        </h4>
      )}

      {!isWorkspaceAudienceEmpty ? (
        <DataTable
          className="rounded-md border-2 font-semibold text-gray-700 dark:border-white dark:text-white"
          columns={audienceColumns}
          data={audienceData}
        />
      ) : (
        <h4 className="py-16 text-center font-Zilla-Slab text-2xl font-bold text-black dark:text-white">
          Add An Audience To This Workspace
        </h4>
      )}
    </main>
  );
}
