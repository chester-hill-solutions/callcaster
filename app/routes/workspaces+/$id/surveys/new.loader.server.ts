import { getWorkspaceRouteContext } from "@/lib/workspace-route.server";
import { data as routeData } from "react-router";
import { User } from "@/lib/types";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ params, context }: LoaderFunctionArgs) {
  const { user, workspaceId, userRole, headers } = getWorkspaceRouteContext(context);

  if (!workspaceId) {
    throw new Response("Workspace ID is required", { status: 400 });
  }

  if (!userRole || !["owner", "admin", "member"].includes(userRole)) {
    throw new Response("Unauthorized", { status: 403 });
  }

  return routeData({
    workspaceId,
    user,
    userRole,
  }, { headers });
}
