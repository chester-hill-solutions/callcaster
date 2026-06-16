import { capitalize } from "@/lib/utils";
import { data as routeData } from "react-router";
import { getUserRole, getWorkspacePhoneNumbers, getWorkspaceUsers } from "@/lib/database.server";
import { handleAddUser, handleDeleteSelf, handleDeleteUser, handleDeleteWorkspace, handleTransferWorkspace, handleUpdateUser, handleUpdateWebhook, removeInvite, testWebhook } from "@/lib/workspace-settings/WorkspaceSettingUtils.server";
import { MemberRole } from "@/lib/member-role";
import { User, WorkspaceData, WorkspaceInvite, WorkspaceWebhook  } from "@/lib/types";
import { verifyAuth } from "@/lib/supabase.server";
import type { LoaderFunctionArgs } from "react-router";

type UserWithRole = Partial<User> & { role: string };

type LoaderData = {
  workspace: WorkspaceData;
  userRole: MemberRole;
  users: UserWithRole[];
  activeUserId: string;
  phoneNumbers: WorkspaceNumbers[];
  pendingInvites: (WorkspaceInvite & {user: Partial<User>})[];
  webhook: WorkspaceWebhook;
  hasAccess: boolean;
}

type WorkspaceNumbers = {
  id: string;
  phone_number: string;
  capabilities: {
    verification_status: 'success' | 'failed' | 'pending';
  };
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {

  const { supabaseClient, headers, user } = await verifyAuth(request);

  const workspaceId = params.id;
  if (!workspaceId) throw new Error("No workspace id found!");
  const userId = user?.id;
  const {data: workspace, error: workspaceError} = await supabaseClient
    .from("workspace")
    .select("name, id, workspace_users(role, user(username, id)), workspace_number(*), audience(*), workspace_invite(*, user(username, id, first_name, last_name)), webhook(*)")
    .eq("id", workspaceId)
    .single();
    
  if (workspaceError) throw workspaceError;
  const userRole = workspace.workspace_users.find((user) => user.user?.id === userId)?.role;
  const users = [] as UserWithRole[];
  const hasAccess = userRole !== MemberRole.Caller; 
  const {workspace_users, workspace_number, audience, workspace_invite, webhook, ...rest} = workspace;
  workspace_users.forEach((user) => {
    users.push({role: user.role, id: user.user?.id, username: user.user?.username} as UserWithRole);
  });
  return routeData(
      {
        workspace: rest,
        userRole,
        users,
        activeUserId: userId,
        phoneNumbers: workspace_number,
        pendingInvites: workspace_invite,
        webhook: webhook[0] as WorkspaceWebhook,
        hasAccess,
      },
      { headers },
    );
  }
