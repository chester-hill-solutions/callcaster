import { data as routeData } from "react-router";
import { getUserRole } from "@/lib/database.server";
import { verifyAuth } from "@/lib/auth.server";

export type WorkspaceLoaderContext = {
  headers: Headers;
  user: { id: string };
  workspaceId: string;
  userRole: NonNullable<Awaited<ReturnType<typeof getUserRole>>>;
};

export type WorkspaceLoaderResult =
  | { ok: true; ctx: WorkspaceLoaderContext }
  | { ok: false; response: ReturnType<typeof routeData<{ error: string }>> };

export const WORKSPACE_ROLE_RANK: Record<string, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  caller: 1,
};

export function hasMinRole(
  role: string | undefined,
  minRole: string | undefined,
): boolean {
  if (!minRole) return true;
  if (!role) return false;
  return (WORKSPACE_ROLE_RANK[role] ?? 0) >= (WORKSPACE_ROLE_RANK[minRole] ?? 0);
}

/**
 * Session auth + workspace membership for workspace UI loaders.
 * Pass `{ minRole }` to enforce a minimum role (owner/admin/member/caller).
 */
export async function requireWorkspaceLoaderContext(
  request: Request,
  workspaceId: string | undefined,
  options?: { minRole?: string },
): Promise<WorkspaceLoaderResult> {
  const { headers, user } = await verifyAuth(request);

  if (!workspaceId) {
    return {
      ok: false,
      response: routeData({ error: "Workspace ID is required" }, { headers, status: 400 }),
    };
  }

  const userRole = await getUserRole({ user, workspaceId });
  if (!userRole) {
    return {
      ok: false,
      response: routeData(
        { error: "Workspace not found" },
        { headers, status: 404 },
      ),
    };
  }

  if (!["owner", "admin", "member", "caller"].includes(userRole.role)) {
    return {
      ok: false,
      response: routeData(
        { error: "Workspace not found" },
        { headers, status: 404 },
      ),
    };
  }

  if (!hasMinRole(userRole.role, options?.minRole)) {
    return {
      ok: false,
      response: routeData(
        { error: "You don't have permission to perform this action" },
        { headers, status: 403 },
      ),
    };
  }

  return {
    ok: true,
    ctx: { headers, user, workspaceId, userRole },
  };
}
