import type { RouterContextProvider } from "react-router";
import { dataPlaneAuthContext } from "@/lib/route-context.server";
import type { DataPlaneAuthContextValue } from "@/lib/route-context.server";
import { jsonError } from "@/lib/platform-api.server";

export function getDataPlaneRouteContext(
  context: Readonly<RouterContextProvider>,
  workspaceId?: string,
): DataPlaneAuthContextValue {
  const auth = context.get(dataPlaneAuthContext);
  if (!auth) {
    throw new Error("Data plane auth context missing");
  }
  if (workspaceId && auth.workspaceId !== workspaceId) {
    throw Response.json({ error: "Workspace not found" }, { status: 404 });
  }
  return auth;
}

/**
 * The standard data-plane route auth (#1892): workspaceId from the route
 * param, user from the middleware context. Routes with extra required params
 * call this, then validate theirs.
 */
export function requireDataPlaneWorkspaceUser({
  params,
  context,
}: {
  params: { workspaceId?: string };
  context: Readonly<RouterContextProvider>;
}): { workspaceId: string; userId: string } | Response {
  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }
  const { userId } = getDataPlaneRouteContext(context, workspaceId);
  if (!userId) {
    return jsonError("Unauthorized", 401);
  }
  return { workspaceId, userId };
}
