import { data as routeData } from "react-router";
import { loadAdminWorkspaceInvitePage } from "@/lib/platform-admin.server";
import { MemberRole } from "@/lib/member-role";
import { requireSudoOrWorkspaceAdmin } from "../../requireSudoOrWorkspaceAdmin.server";
import type { LoaderFunctionArgs } from "react-router";
import type { Tables } from "@/lib/db-types";

type MemberUser = Pick<
  Tables<"user">,
  "id" | "username" | "first_name" | "last_name"
> & {
  role: MemberRole;
};

type PendingInvite = Tables<"workspace_invite"> & {
  user: Pick<
    Tables<"user">,
    "id" | "username" | "first_name" | "last_name"
  > | null;
};

const memberRoles = new Set(Object.values(MemberRole));

const isMemberRole = (role: string | null | undefined): role is MemberRole =>
  !!role && memberRoles.has(role as MemberRole);

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    throw new Error("No workspace id found!");
  }

  const access = await requireSudoOrWorkspaceAdmin(request, workspaceId);
  if (!("user" in access)) {
    return access;
  }

  const { headers, user } = access;
  const page = await loadAdminWorkspaceInvitePage(workspaceId, user.id);
  if (!page.ok) {
    throw new Error(page.error);
  }

  const normalizedUserRole = isMemberRole(page.userRole) ? page.userRole : null;

  return routeData(
    {
      workspace: page.workspace,
      userRole: normalizedUserRole,
      users: page.users as MemberUser[],
      activeUserId: page.activeUserId,
      pendingInvites: page.pendingInvites as PendingInvite[],
      hasAccess: page.hasAccess,
    },
    { headers },
  );
};
