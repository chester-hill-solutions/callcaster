import { data as routeData } from "react-router";
import type { MiddlewareFunction } from "react-router";
import { resolveDataPlaneAuth } from "@/lib/platform-data.server";
import { getUserRole } from "@/lib/database.server";
import { hasMinRole } from "@/lib/workspace-route.server";
import { dataPlaneAuthContext } from "@/lib/route-context.server";

/**
 * Data-plane auth middleware for `api+/workspaces+/$workspaceId/*` routes.
 */
export const dataPlaneMiddleware: MiddlewareFunction = async (
  { request, params, context },
  next,
) => {
  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return routeData({ error: "workspaceId is required" }, { status: 400 });
  }

  const auth = await resolveDataPlaneAuth(request, workspaceId);
  if (auth instanceof Response) {
    return auth;
  }

  context.set(dataPlaneAuthContext, { ...auth, workspaceId });
  return next();
};

export function createDataPlaneMiddlewareWithMinRole(
  minRole: string,
): MiddlewareFunction {
  return async ({ request, params, context }, next) => {
    const workspaceId = params.workspaceId;
    if (!workspaceId) {
      return routeData({ error: "workspaceId is required" }, { status: 400 });
    }

    const auth = context.get(dataPlaneAuthContext);
    if (!auth?.userId) {
      return routeData({ error: "Insufficient role" }, { status: 403 });
    }

    const role = await getUserRole({
      user: { id: auth.userId },
      workspaceId,
    });
    if (!role || !hasMinRole(role.role, minRole)) {
      return routeData({ error: "Insufficient role" }, { status: 403 });
    }

    return next();
  };
}
