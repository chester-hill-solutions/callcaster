import { data as routeData, redirect } from "react-router";
import type { MiddlewareFunction } from "react-router";
import { getUserRole } from "@/lib/database.server";
import { getSession } from "@/lib/auth.server";
import { requireTwoFactorEnrollmentForPrivilegedUser } from "@/lib/two-factor.server";
import {
  hasMinRole,
  WORKSPACE_ROLE_RANK,
} from "@/lib/workspace-route.server";
import { sessionContext, workspaceContext } from "@/lib/route-context.server";

const VALID_ROLES = Object.keys(WORKSPACE_ROLE_RANK);

/**
 * Workspace membership + role middleware for `workspaces+/$id` layout.
 * Sets `workspaceContext`; never writes a response body (SSE-safe for siblings).
 */
export const workspaceMiddleware: MiddlewareFunction = async (
  { request, params, context },
  next,
) => {
  const workspaceId = params.id;
  if (!workspaceId) {
    return routeData({ error: "Workspace ID is required" }, { status: 400 });
  }

  const { user, headers } = await getSession(request);
  if (!user) {
    const url = new URL(request.url);
    const nextPath = `${url.pathname}${url.search}`;
    throw redirect(`/signin?next=${encodeURIComponent(nextPath)}`);
  }

  context.set(sessionContext, { user, headers });

  await requireTwoFactorEnrollmentForPrivilegedUser({
    userId: user.id,
    request,
  });

  const userRoleRow = await getUserRole({ user, workspaceId });
  if (!userRoleRow || !VALID_ROLES.includes(userRoleRow.role)) {
    return routeData(
      { error: "Workspace not found" },
      { headers, status: 404 },
    );
  }

  context.set(workspaceContext, {
    workspaceId,
    userId: user.id,
    userRole: userRoleRow.role,
    headers,
  });

  return next();
};

export function createWorkspaceMiddlewareWithMinRole(
  minRole: string,
): MiddlewareFunction {
  return async ({ context }, next) => {
    const ws = context.get(workspaceContext);
    if (!ws) {
      return routeData({ error: "Workspace context missing" }, { status: 500 });
    }
    if (!hasMinRole(ws.userRole, minRole)) {
      return routeData(
        { error: "You don't have permission to perform this action" },
        { headers: ws.headers, status: 403 },
      );
    }
    return next();
  };
}
