import { getWorkspaceRouteContext } from "@/lib/workspace-route.server";
import { data as routeData } from "react-router";
import { getUserRole } from "@/lib/database/workspace.server";
import { listWorkspaceSurveysApi } from "@/lib/platform-data.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const { user, workspaceId, userRole, headers } = getWorkspaceRouteContext(context);

  if (!workspaceId) {
    throw new Response("Workspace ID is required", { status: 400 });
  }
  const result = await listWorkspaceSurveysApi(workspaceId);
  if (!result.ok) {
    throw new Response(result.error, { status: result.status });
  }

  return routeData({
    surveys: result.surveys,
    workspaceId,
    user,
    userRole,
  });
}
