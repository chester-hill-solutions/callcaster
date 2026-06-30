import { data as routeData } from "react-router";
import { getUserRole } from "@/lib/database.server";
import { listWorkspaceSurveysApi } from "@/lib/platform-data.server";
import { verifyAuth } from "@/lib/auth.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { user } = await verifyAuth(request);
  const workspaceId = params.id;

  if (!workspaceId) {
    throw new Response("Workspace ID is required", { status: 400 });
  }

  const userRole = await getUserRole({
    user,
    workspaceId,
  });

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
