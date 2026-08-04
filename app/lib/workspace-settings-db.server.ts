import { MemberRole } from "@/lib/member-role";
import type { User, WorkspaceInvite, WorkspaceWebhook } from "@/lib/types";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import {
  getWorkspaceById,
  getWorkspaceWebhookRow,
  listWorkspaceApiKeyRows,
  listWorkspaceInvitesEnriched,
  listWorkspaceMembersEnriched,
} from "@/lib/workspace-members-db.server";
import { createTenantDb } from "@/server/tenant-db";

type UserWithRole = Partial<User> & { role: string };

export type WorkspaceSettingsPageData = {
  workspace: { id: string; name: string | null };
  userRole: MemberRole | undefined;
  users: UserWithRole[];
  phoneNumbers: Awaited<
    ReturnType<ReturnType<typeof createTenantDb>["workspace_number"]["findMany"]>
  >;
  pendingInvites: (WorkspaceInvite & { user: Partial<User> | null })[];
  webhook: WorkspaceWebhook | null;
  hasAccess: boolean;
  apiKeys: Awaited<ReturnType<typeof listWorkspaceApiKeyRows>>;
};

export async function getWorkspaceSettingsPageData(
  workspaceId: string,
  userId: string,
): Promise<WorkspaceSettingsPageData> {
  await requireWorkspaceAccess({ user: { id: userId }, workspaceId });

  const workspace = await getWorkspaceById(workspaceId);
  if (!workspace) {
    throw new Error("Workspace not found");
  }

  const tdb = createTenantDb(workspaceId);
  const [members, phoneNumbers, pendingInvites, webhookRow] = await Promise.all([
    listWorkspaceMembersEnriched(workspaceId),
    tdb.workspace_number.findMany(),
    listWorkspaceInvitesEnriched(workspaceId),
    getWorkspaceWebhookRow(workspaceId, tdb),
  ]);

  const currentMember = members.find((member) => member.user_id === userId);
  const userRole = currentMember?.role as MemberRole | undefined;
  const users: UserWithRole[] = members.map((member) => ({
    role: member.role,
    id: member.user_id,
    username: member.username,
  }));
  const hasAccess = userRole !== MemberRole.Caller;
  const apiKeys = hasAccess
    ? await listWorkspaceApiKeyRows(workspaceId, tdb)
    : [];

  return {
    workspace: { id: workspace.id, name: workspace.name },
    userRole,
    users,
    phoneNumbers,
    pendingInvites: pendingInvites.map((invite) => ({
      ...invite,
      user: invite.user ?? {},
    })),
    webhook: (webhookRow as WorkspaceWebhook | null) ?? null,
    hasAccess,
    apiKeys,
  };
}
