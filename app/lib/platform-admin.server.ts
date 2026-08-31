import {
  repointAllWorkspaceTwilioWebhooks,
  repointWorkspaceTwilioWebhooks,
} from "@/lib/twilio-webhook-audit.server";
import { deriveWorkspaceAdminRows } from "@/lib/admin-workspaces.server";
import { listRecentDeadLetteredJobs } from "@/lib/admin-jobs.server";
import type { Database } from "@/lib/db-types";
import { syncWorkspaceTwilioSnapshot } from "@/lib/database/workspace.server";
import { env } from "@/lib/env.server";
import {
  deleteAdminWorkspaceMember,
  deleteWorkspaceInviteById,
  findAdminWorkspaceMembership,
  getUserById,
  insertAdminWorkspaceMember,
  listAllCampaignsOrdered,
  listAllUsersOrdered,
  listAllWorkspaceNumbers,
  listAllWorkspacesOrdered,
  listAllWorkspaceUsers,
  listPendingInvitesForUsername,
  listUserWorkspaceMembershipsWithWorkspace,
  listWorkspaceInvitesEnriched,
  listAdminWorkspaceUsersWithUser,
  listWorkspaceNumbersForWorkspace,
  getWorkspaceWithCampaigns,
  getWorkspaceById,
  setWorkspaceDisabled,
  updateAdminWorkspaceMemberRole,
  updateUserAccessLevel,
  updateUserProfile,
} from "@/lib/workspace-members-db.server";

type UserRow = Database["public"]["Tables"]["user"]["Row"];

export async function repointAllWorkspacesTwilioWebhooks(): Promise<
  | { ok: true; results: import("@/lib/twilio-webhook-audit.server").TwilioWebhookRepointResult[] }
  | { ok: false; error: string }
> {
  const result = await repointAllWorkspaceTwilioWebhooks();
  if (!result.ok) {
    return result;
  }
  return { ok: true, results: result.results };
}

export async function repointWorkspaceTwilioWebhooksForAdmin(
  workspaceId: string,
): Promise<{ ok: true; result: Awaited<ReturnType<typeof repointWorkspaceTwilioWebhooks>> } | { ok: false; error: string }> {
  try {
    const result = await repointWorkspaceTwilioWebhooks({ workspaceId });
    return { ok: true, result };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to repoint webhooks",
    };
  }
}

export async function getAdminDashboard() {
  const [
    workspaces,
    users,
    workspaceUsers,
    workspaceNumbers,
    allCampaigns,
    deadLetteredJobs,
  ] = await Promise.all([
    listAllWorkspacesOrdered(),
    listAllUsersOrdered(),
    listAllWorkspaceUsers(),
    listAllWorkspaceNumbers(),
    listAllCampaignsOrdered(),
    listRecentDeadLetteredJobs(),
  ]);

  const campaignsByWorkspace = new Map<string, typeof allCampaigns>();
  for (const campaign of allCampaigns) {
    if (!campaign.workspace) continue;
    const existing = campaignsByWorkspace.get(campaign.workspace) ?? [];
    existing.push(campaign);
    campaignsByWorkspace.set(campaign.workspace, existing);
  }

  const workspacesWithCampaigns = workspaces.map((row) => ({
    ...row,
    campaign: campaignsByWorkspace.get(row.id) ?? [],
  }));

  const workspaceRows = deriveWorkspaceAdminRows({
    workspaces: workspacesWithCampaigns as Parameters<typeof deriveWorkspaceAdminRows>[0]["workspaces"],
    users: users as Parameters<typeof deriveWorkspaceAdminRows>[0]["users"],
    workspaceUsers: workspaceUsers as Parameters<typeof deriveWorkspaceAdminRows>[0]["workspaceUsers"],
    workspaceNumbers: workspaceNumbers as Parameters<typeof deriveWorkspaceAdminRows>[0]["workspaceNumbers"],
  });

  return {
    workspaces: workspacesWithCampaigns,
    users,
    workspaceUsers,
    workspaceNumbers,
    workspaceRows,
    campaigns: allCampaigns,
    deadLetteredJobs,
    stats: {
      totalWorkspaces: workspaces.length,
      totalUsers: users.length,
      totalCampaigns: allCampaigns.length,
      activeWorkspaces: workspaces.filter((w) => !w.disabled).length,
    },
  };
}

export async function toggleWorkspaceStatus(
  workspaceId: string,
  disabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const updated = await setWorkspaceDisabled(workspaceId, disabled);
    if (!updated) {
      return { ok: false, error: "Workspace not found" };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to update workspace",
    };
  }
}

export async function syncAllWorkspacesTwilio(
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const workspaces = await listAllWorkspacesOrdered();
    for (const ws of workspaces) {
      await syncWorkspaceTwilioSnapshot({ workspaceId: ws.id });
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to sync" };
  }
}

export async function syncWorkspaceTwilio(
  workspaceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await syncWorkspaceTwilioSnapshot({ workspaceId });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to sync workspace Twilio data",
    };
  }
}

export async function disableUser(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const updated = await updateUserAccessLevel(userId, "disabled");
    if (!updated) {
      return { ok: false, error: "User not found" };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to disable user",
    };
  }
}

export async function getAdminUser(
  userId: string,
): Promise<
  | { ok: true; user: UserRow }
  | { ok: false; error: string; status: number }
> {
  const targetUser = await getUserById(userId);
  if (!targetUser) {
    return { ok: false, error: "User not found", status: 404 };
  }

  return { ok: true, user: targetUser as UserRow };
}

export async function updateAdminUser(
  userId: string,
  updates: {
    first_name?: string | null;
    last_name?: string | null;
    username: string;
    access_level?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const updated = await updateUserProfile({ userId, ...updates });
    if (!updated) {
      return { ok: false, error: "User not found" };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to update user",
    };
  }
}

export async function getAdminUserWorkspaces(
  userId: string,
) {
  const userResult = await getAdminUser(userId);
  if (!userResult.ok) {
    return userResult;
  }

  const [allWorkspaces, membershipRows, pendingInviteRows] = await Promise.all([
    listAllWorkspacesOrdered(),
    listUserWorkspaceMembershipsWithWorkspace(userId),
    listPendingInvitesForUsername(userResult.user.username),
  ]);

  const userWorkspaces = membershipRows;
  const pendingInvites = pendingInviteRows.map((row) => ({
    ...row.invite,
    workspace: row.workspace,
  }));

  return {
    ok: true as const,
    targetUser: userResult.user,
    allWorkspaces,
    userWorkspaces,
    pendingInvites,
  };
}

export async function addUserToWorkspaceAdmin(
  userId: string,
  workspaceId: string,
  role: "owner" | "member" | "caller" | "admin",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const existingMembership = await findAdminWorkspaceMembership({
    userId,
    workspaceId,
  });

  if (existingMembership) {
    return { ok: false, error: "User is already a member of this workspace" };
  }

  try {
    await insertAdminWorkspaceMember({ userId, workspaceId, role });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to add user",
    };
  }
}

export async function updateUserWorkspaceRoleAdmin(
  userId: string,
  workspaceId: string,
  role: "owner" | "member" | "caller" | "admin",
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const updated = await updateAdminWorkspaceMemberRole({
      userId,
      workspaceId,
      role,
    });
    if (!updated) {
      return { ok: false, error: "Membership not found" };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to update role",
    };
  }
}

export async function removeUserFromWorkspaceAdmin(
  userId: string,
  workspaceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await deleteAdminWorkspaceMember({ userId, workspaceId });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to remove user",
    };
  }
}

export async function cancelWorkspaceInviteAdmin(
  inviteId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await deleteWorkspaceInviteById(inviteId);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to cancel invite",
    };
  }
}

export async function getAdminWorkspaceDetail(
  workspaceId: string,
) {
  const workspace = await getWorkspaceWithCampaigns(workspaceId);
  if (!workspace) {
    return { ok: false as const, error: "Workspace not found", status: 404 };
  }

  const [workspaceUsers, phoneNumbers] = await Promise.all([
    listAdminWorkspaceUsersWithUser(workspaceId),
    listWorkspaceNumbersForWorkspace(workspaceId),
  ]);

  return {
    ok: true as const,
    workspace,
    workspaceUsers,
    phoneNumbers,
  };
}

export async function loadAdminWorkspaceInvitePage(
  workspaceId: string,
  activeUserId: string,
) {
  const workspace = await getWorkspaceById(workspaceId);
  if (!workspace) {
    return { ok: false as const, error: "Workspace not found", status: 404 };
  }

  const [workspaceUsers, pendingInvites] = await Promise.all([
    listAdminWorkspaceUsersWithUser(workspaceId),
    listWorkspaceInvitesEnriched(workspaceId),
  ]);

  const users = workspaceUsers.flatMap((member) => {
    if (!member.user) {
      return [];
    }
    return [
      {
        id: member.user.id,
        username: member.user.username,
        first_name: member.user.first_name,
        last_name: member.user.last_name,
        role: member.role,
      },
    ];
  });

  const activeMembership = workspaceUsers.find((member) => member.user_id === activeUserId);
  const userRole = activeMembership?.role ?? null;
  const hasAccess = userRole === "admin" || userRole === "owner";

  return {
    ok: true as const,
    workspace: { id: workspace.id, name: workspace.name },
    userRole,
    users,
    activeUserId,
    pendingInvites,
    hasAccess,
  };
}
