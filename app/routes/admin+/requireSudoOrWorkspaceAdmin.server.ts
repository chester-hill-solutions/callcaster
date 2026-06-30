import { data as routeData, redirect } from "react-router";

import { verifyAuth } from "@/lib/supabase.server";
import {
  findAdminWorkspaceMembership,
  getUserById,
} from "@/lib/workspace-members-db.server";

export async function requireSudoOrWorkspaceAdmin(
  request: Request,
  workspaceId: string,
) {
  const { supabaseClient, headers, user } = await verifyAuth(request);
  const userData = await getUserById(user.id);
  const membership = await findAdminWorkspaceMembership({
    workspaceId,
    userId: user.id,
  });

  const hasSudoAccess = userData?.access_level === "sudo";
  const hasWorkspaceAdminAccess =
    membership?.role === "admin" || membership?.role === "owner";

  if (!hasSudoAccess && !hasWorkspaceAdminAccess) {
    return routeData({ error: "Unauthorized" }, { status: 403, headers });
  }

  return {
    supabaseClient,
    headers,
    user,
    userData,
    membership,
    hasSudoAccess,
    hasWorkspaceAdminAccess,
  };
}

export async function requireSudoOrWorkspaceAdminOrRedirect(
  request: Request,
  workspaceId: string,
) {
  const result = await requireSudoOrWorkspaceAdmin(request, workspaceId);
  if (result instanceof Response) {
    throw result;
  }
  return result;
}
