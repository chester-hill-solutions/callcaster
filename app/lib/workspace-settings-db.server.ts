import { capabilityIdsForRole, type ProductCapabilityId } from "@/lib/capabilities";
import { hasMinRole, MemberRole } from "@/lib/member-role";
import type { User, WorkspaceWebhook } from "@/lib/types";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import {
  getWorkspaceById,
  getWorkspaceWebhookRow,
  listWorkspaceApiKeyRows,
  listWorkspaceInvitesEnriched,
  listWorkspaceMembersEnriched,
} from "@/lib/workspace-members-db.server";
import { createTenantDb } from "@/server/tenant-db";
import type { WorkspaceInvitationView } from "@/lib/workspace-invitations.server";

type UserWithRole = Partial<User> & { role: string };

/** Email-first pending invite with a resolved display user (SEC-03 / #1713). */
export type PendingInvitationRow = WorkspaceInvitationView & {
  user: Partial<User> | null;
};

export type WorkspaceSettingsPageData = {
  workspace: { id: string; name: string | null };
  userRole: MemberRole | undefined;
  users: UserWithRole[];
  pendingInvites: PendingInvitationRow[];
  webhook: WorkspaceWebhook | null;
  hasAccess: boolean;
  /**
   * API-key management sits a rung above the rest of settings (admin+, not
   * member+) because a key is a durable credential that outlives its minter.
   * Mirrors `requireApiKeyManager` in `platform-members.server.ts`; keeping the
   * two in step is what stops the UI offering a form the service will 403.
   */
  canManageApiKeys: boolean;
  /**
   * Capability scopes this user may put on a new key — the intersection cap
   * from `assertScopesWithinActorRole`, precomputed so the picker cannot offer
   * a scope the minter does not hold (e.g. `audit.read` is owner-only).
   */
  grantableApiKeyScopes: readonly ProductCapabilityId[];
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
  const [members, pendingInvites, webhookRow] = await Promise.all([
    listWorkspaceMembersEnriched(workspaceId),
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
  const canManageApiKeys = hasMinRole(userRole, MemberRole.Admin);
  const apiKeys = canManageApiKeys
    ? await listWorkspaceApiKeyRows(workspaceId, tdb)
    : [];

  return {
    workspace: { id: workspace.id, name: workspace.name },
    userRole,
    users,
    pendingInvites: pendingInvites.map((invite) => ({
      ...invite,
      user: invite.user ?? null,
    })),
    webhook: (webhookRow as WorkspaceWebhook | null) ?? null,
    hasAccess,
    canManageApiKeys,
    grantableApiKeyScopes: canManageApiKeys
      ? capabilityIdsForRole(userRole ?? "")
      : [],
    apiKeys,
  };
}
