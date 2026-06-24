import { data as routeData } from "react-router";
import { listWorkspaceAudiencesApi } from "@/lib/platform-data.server";
import { requireWorkspaceLoaderContext } from "@/lib/workspace-route.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const access = await requireWorkspaceLoaderContext(request, params.id);
  if (!access.ok) {
    return access.response;
  }

  const { supabaseClient, headers, workspaceId, userRole } = access.ctx;

  const { data: workspaceData, error: workspaceError } = await supabaseClient
    .from("workspace")
    .select()
    .eq("id", workspaceId)
    .single();

  if (workspaceError) {
    return routeData(
      { workspace: null, error: workspaceError.message, userRole },
      { headers },
    );
  }

  const audiencesResult = await listWorkspaceAudiencesApi(supabaseClient, workspaceId);
  if (!audiencesResult.ok) {
    return routeData(
      {
        workspace: workspaceData,
        error: audiencesResult.error,
        userRole,
        audienceData: null,
      },
      { headers, status: audiencesResult.status },
    );
  }

  return routeData(
    {
      audienceData: audiencesResult.audiences,
      workspace: workspaceData,
      error: null,
      userRole,
    },
    { headers },
  );
}
