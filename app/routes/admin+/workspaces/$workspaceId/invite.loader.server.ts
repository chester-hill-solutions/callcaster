import type { Database, Tables } from "@/lib/database.types";
import { data as routeData, ActionFunctionArgs, LoaderFunctionArgs, Form, useActionData, useLoaderData } from "react-router";
import { capitalize } from "@/lib/utils";
import { data as routeData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";
import { handleAddUser, handleDeleteSelf, handleDeleteUser, handleUpdateUser, removeInvite } from "@/lib/workspace-settings/WorkspaceSettingUtils.server";

type WorkspaceRole = Database["public"]["Enums"]["workspace_role"];

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

type WorkspaceMemberRecord = {
  role: WorkspaceRole;
  user: Pick<
    Tables<"user">,
    "id" | "username" | "first_name" | "last_name"
  > | null;
};

type WorkspaceMemberWithUser = WorkspaceMemberRecord & {
  user: Pick<
    Tables<"user">,
    "id" | "username" | "first_name" | "last_name"
  >;
};

type LoaderData = {
  workspace: Pick<Tables<"workspace">, "id" | "name">;
  userRole: MemberRole | null;
  users: MemberUser[];
  activeUserId: string;
  pendingInvites: PendingInvite[];
  hasAccess: boolean;
};

type DisplayUser = Pick<
  Tables<"user">,
  "id" | "username" | "first_name" | "last_name"
> & {
  role: MemberRole | "invited";
};

const memberRoles = new Set(Object.values(MemberRole));

const isMemberRole = (role: string | null | undefined): role is MemberRole =>
  !!role && memberRoles.has(role as MemberRole);

export const loader = async ({ request, params }: LoaderFunctionArgs) => {


  const { supabaseClient, headers, user } = await verifyAuth(request);

  const workspaceId = params.workspaceId;
  if (!workspaceId) throw new Error("No workspace id found!");
  const userId = user.id;

  const { data: userData } = await supabaseClient
    .from("user")
    .select("access_level")
    .eq("id", userId)
    .single();
  
  // Check if user is admin
  const { data: userRoleData } = await supabaseClient
    .from("workspace_users")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .single();

  const hasSudoAccess = userData?.access_level === "sudo";
  const hasWorkspaceAdminAccess = userRoleData?.role === "admin" || userRoleData?.role === "owner";

  if (!hasSudoAccess && !hasWorkspaceAdminAccess) {
    return routeData({ error: "Unauthorized" }, { status: 403, headers });
  }

  const { data: workspace, error: workspaceError } = await supabaseClient
    .from("workspace")
    .select(
      `
        id,
        name,
        workspace_users (
          role,
          user: user_id (
            id,
            username,
            first_name,
            last_name
          )
        ),
        workspace_invite (
          id,
          created_at,
          isNew,
          role,
          user_id,
          workspace,
          user: user_id (
            id,
            username,
            first_name,
            last_name
          )
        )
      `,
    )
    .eq("id", workspaceId)
    .single<WorkspaceWithMembers>();
    
  if (workspaceError) throw workspaceError;
  
  const workspaceUsers =
    workspace.workspace_users?.filter(
      (member: WorkspaceMemberRecord | null): member is WorkspaceMemberWithUser =>
        member !== null && member.user !== null,
    ) ?? [];

  const users: MemberUser[] = workspaceUsers.map(({ role, user }: WorkspaceMemberWithUser) => ({
    id: user.id,
    username: user.username,
    first_name: user.first_name,
    last_name: user.last_name,
    role: role as MemberRole,
  }));
  
  const userRole =
    workspaceUsers.find((member: WorkspaceMemberWithUser) => member.user.id === userId)?.role ?? null;
  const normalizedUserRole = isMemberRole(userRole) ? userRole : null;
  const hasAccess =
    normalizedUserRole === MemberRole.Admin ||
    normalizedUserRole === MemberRole.Owner;

  const pendingInvites =
    workspace.workspace_invite?.filter(
      (invite: PendingInvite | null): invite is PendingInvite => invite !== null,
    ) ?? [];
  
  return routeData(
    {
      workspace: { id: workspace.id, name: workspace.name },
      userRole: normalizedUserRole,
      users,
      activeUserId: userId,
      pendingInvites,
      hasAccess,
    },
    { headers },
  );
}
