import { data as routeData } from "react-router";
import { listWorkspaceAudiencesApi } from "@/lib/platform-data.server";
import { getWorkspaceById } from "@/lib/workspace-members-db.server";
import { requireWorkspaceLoaderContext } from "@/lib/workspace-route.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const access = await requireWorkspaceLoaderContext(request, params.id);
  if (!access.ok) {
    return access.response;
  }

  const { supabaseClient, headers, workspaceId, userRole } = access.ctx;

  const workspaceData = await getWorkspaceById(workspaceId);

  if (!workspaceData) {
    return routeData(
      { workspace: null, error: "Workspace not found", userRole },
      { headers, status: 404 },
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
