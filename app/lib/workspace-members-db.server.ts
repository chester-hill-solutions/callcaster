import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  campaign as campaignTable,
  job as jobTable,
  user as userTable,
  webhook as webhookTable,
  workspace as workspaceTable,
  workspace_api_key as workspaceApiKeyTable,
  workspace_invite as workspaceInviteTable,
  workspace_member as workspaceMemberTable,
  workspace_number as workspaceNumberTable,
} from "@/db/schema";
import { authUser } from "@/db/auth-schema";
import type { Database } from "@/lib/db-types";
import { adminDb } from "@/server/admin-db";
import { db } from "@/server/db";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";
import { mergeWorkspaceTwilioData as mergeWorkspaceTwilioDataCore } from "@/lib/merge-workspace-twilio-data.server";
import {
  timestampToIsoString,
  timestampToIsoStringOrNull,
} from "@/lib/parse-utils.server";
import {
  memberRoleToRoleId,
  workspaceMemberId,
} from "@/lib/workspace-membership.server";

type WorkspaceRole = Database["public"]["Enums"]["workspace_role"];

export async function findUserIdByUsername(username: string) {
  const cleaned = username.toLowerCase().trim();
  const [row] = await adminDb
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.username, cleaned))
    .limit(1);
  return row?.id ?? null;
}

export async function findWorkspaceInviteForUser(
  workspaceId: string,
  userId: string,
  tdbIn?: TenantDb,
) {
  const tdb = tdbIn ?? createTenantDb(workspaceId);
  return tdb.workspace_invite.findFirst({
    where: eq(workspaceInviteTable.user_id, userId),
    columns: { id: true, role: true, created_at: true, isNew: true },
  });
}

export async function listWorkspaceMembersEnriched(workspaceId: string) {
  const rows = await adminDb
    .select({
      role: workspaceMemberTable.role_id,
      user_id: userTable.id,
      username: userTable.username,
      first_name: userTable.first_name,
      last_name: userTable.last_name,
    })
    .from(workspaceMemberTable)
    .innerJoin(userTable, eq(workspaceMemberTable.user_id, userTable.id))
    .where(eq(workspaceMemberTable.workspace_id, workspaceId));

  return rows.map((row) => ({
    user_id: row.user_id,
    username: row.username,
    first_name: row.first_name,
    last_name: row.last_name,
    role: row.role,
  }));
}

export async function listWorkspaceInvitesEnriched(workspaceId: string) {
  const tdb = createTenantDb(workspaceId);
  const invites = await tdb.workspace_invite.findMany({
    orderBy: (invite, { desc: descFn }) => [descFn(invite.created_at)],
  });
  if (invites.length === 0) {
    return [];
  }

  const userIds = invites.map((invite) => invite.user_id);
  const users =
    userIds.length === 0
      ? []
      : await adminDb
          .select({
            id: userTable.id,
            username: userTable.username,
            first_name: userTable.first_name,
            last_name: userTable.last_name,
          })
          .from(userTable)
          .where(inArray(userTable.id, userIds));

  const usersById = new Map(users.map((user) => [user.id, user]));
  return invites.map((invite) => ({
    ...invite,
    user: usersById.get(invite.user_id) ?? null,
  }));
}

export async function updateWorkspaceMemberRole(args: {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  tdb?: TenantDb;
}) {
  const tdb = args.tdb ?? createTenantDb(args.workspaceId);
  const roleId = memberRoleToRoleId(args.role);
  const rows = await tdb.workspace_member.update({
    set: { role_id: roleId },
    where: and(eq(workspaceMemberTable.user_id, args.userId)),
  });
  const row = rows[0] ?? null;
  if (!row) return null;
  return { ...row, role: row.role_id };
}

export async function removeWorkspaceMember(args: {
  workspaceId: string;
  userId: string;
  tdb?: TenantDb;
}) {
  const tdb = args.tdb ?? createTenantDb(args.workspaceId);
  const rows = await tdb.workspace_member.findMany({
    where: eq(workspaceMemberTable.user_id, args.userId),
  });
  const member = rows[0] ?? null;
  if (!member) {
    return null;
  }
  await tdb.workspace_member.delete({
    where: eq(workspaceMemberTable.user_id, args.userId),
  });
  return { ...member, role: member.role_id };
}

export async function removeWorkspaceInviteForUser(args: {
  workspaceId: string;
  userId: string;
  tdb?: TenantDb;
}) {
  const tdb = args.tdb ?? createTenantDb(args.workspaceId);
  const invites = await tdb.workspace_invite.findMany({
    where: eq(workspaceInviteTable.user_id, args.userId),
  });
  await tdb.workspace_invite.delete({
    where: eq(workspaceInviteTable.user_id, args.userId),
  });
  return invites;
}

export async function transferWorkspaceOwnership(args: {
  workspaceId: string;
  currentOwnerUserId: string;
  newOwnerUserId: string;
}) {
  return db.transaction(async (tx) => {
    const tdb = createTenantDb(args.workspaceId, tx as unknown as typeof db);

    const newOwnerMembership = await findWorkspaceMembership(
      args.workspaceId,
      args.newOwnerUserId,
      tdb,
    );
    if (!newOwnerMembership) {
      throw new Error("New owner must be an existing workspace member");
    }

    const [newOwner] = await tdb.workspace_member.update({
      set: { role_id: "owner" },
      where: eq(workspaceMemberTable.user_id, args.newOwnerUserId),
    });
    if (!newOwner) {
      throw new Error("Failed to promote the new owner");
    }

    const [previousOwner] = await tdb.workspace_member.update({
      set: { role_id: "admin" },
      where: eq(workspaceMemberTable.user_id, args.currentOwnerUserId),
    });
    if (!previousOwner) {
      throw new Error("Failed to demote the previous owner");
    }

    return {
      newOwner: { ...newOwner, role: newOwner.role_id },
      previousOwner: { ...previousOwner, role: previousOwner.role_id },
    };
  });
}

export async function getWorkspaceWebhookRow(workspaceId: string, tdbIn?: TenantDb) {
  const tdb = tdbIn ?? createTenantDb(workspaceId);
  return tdb.webhook.findFirst({
    where: eq(webhookTable.workspace, workspaceId),
  });
}

export async function upsertWorkspaceWebhookRow(args: {
  workspaceId: string;
  userId: string;
  destinationUrl: string;
  customHeaders: Record<string, string>;
  events: string[];
  webhookId?: number;
  tdb?: TenantDb;
}) {
  const tdb = args.tdb ?? createTenantDb(args.workspaceId);
  const now = new Date().toISOString();
  const set = {
    destination_url: args.destinationUrl,
    updated_at: now,
    updated_by: args.userId,
    custom_headers: args.customHeaders,
    events: args.events,
  };

  if (args.webhookId != null) {
    const rows = await tdb.webhook.update({
      set,
      where: eq(webhookTable.id, args.webhookId),
    });
    return rows[0] ?? null;
  }

  const existing = await getWorkspaceWebhookRow(args.workspaceId, tdb);
  if (existing) {
    const rows = await tdb.webhook.update({
      set,
      where: eq(webhookTable.id, existing.id),
    });
    return rows[0] ?? null;
  }

  const rows = await tdb.webhook.insert({
    ...set,
    created_at: now,
    type: null,
  });
  return rows[0] ?? null;
}

export async function listWorkspaceApiKeyRows(workspaceId: string, tdbIn?: TenantDb) {
  const tdb = tdbIn ?? createTenantDb(workspaceId);
  return tdb.workspace_api_key.findMany({
    columns: {
      id: true,
      name: true,
      key_prefix: true,
      created_at: true,
      last_used_at: true,
      scopes: true,
      expires_at: true,
    },
    orderBy: (key, { desc: descFn }) => [descFn(key.created_at)],
  });
}

export async function insertWorkspaceApiKeyRow(args: {
  workspaceId: string;
  userId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes: readonly string[];
  expiresAt: string;
  tdb?: TenantDb;
}) {
  const tdb = args.tdb ?? createTenantDb(args.workspaceId);
  const rows = await tdb.workspace_api_key.insert({
    id: crypto.randomUUID(),
    name: args.name.trim(),
    key_prefix: args.keyPrefix,
    key_hash: args.keyHash,
    created_by: args.userId,
    created_at: new Date().toISOString(),
    scopes: [...args.scopes],
    expires_at: args.expiresAt,
  });
  return rows[0] ?? null;
}

export async function deleteWorkspaceApiKeyRow(args: {
  workspaceId: string;
  keyId: string;
  tdb?: TenantDb;
}) {
  const tdb = args.tdb ?? createTenantDb(args.workspaceId);
  await tdb.workspace_api_key.delete({
    where: eq(workspaceApiKeyTable.id, args.keyId),
  });
}

export async function findWorkspaceMembership(
  workspaceId: string,
  userId: string,
  tdbIn?: TenantDb,
) {
  const tdb = tdbIn ?? createTenantDb(workspaceId);
  const row = await tdb.workspace_member.findFirst({
    where: eq(workspaceMemberTable.user_id, userId),
  });
  if (!row) return null;
  return { ...row, role: row.role_id };
}

export async function insertWorkspaceMembership(args: {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  tdb?: TenantDb;
}) {
  const tdb = args.tdb ?? createTenantDb(args.workspaceId);
  const roleId = memberRoleToRoleId(args.role);
  const rows = await tdb.workspace_member.insert({
    id: workspaceMemberId(args.workspaceId, args.userId),
    user_id: args.userId,
    role_id: roleId,
  });
  const row = rows[0] ?? null;
  if (!row) return null;
  return { ...row, role: row.role_id };
}

export async function deleteWorkspaceById(workspaceId: string) {
  const rows = await adminDb
    .delete(workspaceTable)
    .where(eq(workspaceTable.id, workspaceId))
    .returning();
  return rows;
}

export async function listAllWorkspacesOrdered() {
  return adminDb.select().from(workspaceTable).orderBy(asc(workspaceTable.name));
}

export async function listAllUsersOrdered() {
  return adminDb
    .select()
    .from(userTable)
    .orderBy(desc(userTable.created_at));
}

export async function listAllWorkspaceUsers() {
  const rows = await adminDb.select().from(workspaceMemberTable);
  return rows.map((row) => ({
    id: row.id,
    workspace_id: row.workspace_id,
    user_id: row.user_id,
    role: row.role_id,
    created_at: timestampToIsoString(row.created_at),
    last_accessed: null as string | null,
  }));
}

export async function listAllWorkspaceNumbers() {
  return adminDb.select().from(workspaceNumberTable);
}

export async function listAllCampaignsOrdered() {
  return adminDb
    .select()
    .from(campaignTable)
    .orderBy(desc(campaignTable.created_at));
}

/** Read-only diagnostics: most-recently dead-lettered background jobs (status='failed'). */
export async function listRecentDeadLetteredJobs(limit = 25) {
  return adminDb
    .select({
      id: jobTable.id,
      type: jobTable.type,
      workspace_id: jobTable.workspace_id,
      attempt_count: jobTable.attempt_count,
      max_attempts: jobTable.max_attempts,
      dead_letter_reason: jobTable.dead_letter_reason,
      error_message: jobTable.error_message,
      failed_at: jobTable.failed_at,
      created_at: jobTable.created_at,
    })
    .from(jobTable)
    .where(eq(jobTable.status, "failed"))
    .orderBy(desc(jobTable.failed_at))
    .limit(limit);
}

export async function updateUserAccessLevel(userId: string, accessLevel: string) {
  const rows = await adminDb
    .update(userTable)
    .set({ access_level: accessLevel })
    .where(eq(userTable.id, userId))
    .returning();
  return rows[0] ?? null;
}

export async function getUserById(userId: string) {
  const [row] = await adminDb
    .select()
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  return row ?? null;
}

export async function updateUserProfile(args: {
  userId: string;
  first_name?: string | null;
  last_name?: string | null;
  username: string;
  access_level?: string;
}) {
  const rows = await adminDb
    .update(userTable)
    .set({
      first_name: args.first_name ?? null,
      last_name: args.last_name ?? null,
      username: args.username,
      access_level: args.access_level ?? "standard",
    })
    .where(eq(userTable.id, args.userId))
    .returning();
  return rows[0] ?? null;
}

export async function setWorkspaceDisabled(workspaceId: string, disabled: boolean) {
  const rows = await adminDb
    .update(workspaceTable)
    .set({ disabled })
    .where(eq(workspaceTable.id, workspaceId))
    .returning({ id: workspaceTable.id });
  return rows[0] ?? null;
}

export async function listUserWorkspaceMemberships(userId: string) {
  const rows = await adminDb
    .select()
    .from(workspaceMemberTable)
    .where(eq(workspaceMemberTable.user_id, userId));
  return rows.map((row) => ({
    ...row,
    role: row.role_id,
    workspace_id: row.workspace_id,
  }));
}

export async function listPendingInvitesForUsername(username: string) {
  const cleaned = username.toLowerCase().trim();
  return adminDb
    .select({
      invite: workspaceInviteTable,
      workspace: workspaceTable,
    })
    .from(workspaceInviteTable)
    .innerJoin(userTable, eq(workspaceInviteTable.user_id, userTable.id))
    .innerJoin(workspaceTable, eq(workspaceInviteTable.workspace, workspaceTable.id))
    .where(eq(userTable.username, cleaned));
}

export async function deleteWorkspaceInviteById(inviteId: string) {
  await adminDb
    .delete(workspaceInviteTable)
    .where(eq(workspaceInviteTable.id, inviteId));
}

export async function updateAdminWorkspaceMemberRole(args: {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
}) {
  const roleId = memberRoleToRoleId(args.role);
  const rows = await adminDb
    .update(workspaceMemberTable)
    .set({ role_id: roleId })
    .where(
      and(
        eq(workspaceMemberTable.user_id, args.userId),
        eq(workspaceMemberTable.workspace_id, args.workspaceId),
      ),
    )
    .returning();
  const row = rows[0] ?? null;
  if (!row) return null;
  return { ...row, role: row.role_id };
}

export async function deleteAdminWorkspaceMember(args: {
  workspaceId: string;
  userId: string;
}) {
  await adminDb
    .delete(workspaceMemberTable)
    .where(
      and(
        eq(workspaceMemberTable.user_id, args.userId),
        eq(workspaceMemberTable.workspace_id, args.workspaceId),
      ),
    );
}

export async function insertAdminWorkspaceMember(args: {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
}) {
  const roleId = memberRoleToRoleId(args.role);
  const rows = await adminDb
    .insert(workspaceMemberTable)
    .values({
      id: workspaceMemberId(args.workspaceId, args.userId),
      user_id: args.userId,
      workspace_id: args.workspaceId,
      role_id: roleId,
    })
    .returning();
  const row = rows[0] ?? null;
  if (!row) return null;
  return { ...row, role: row.role_id };
}

export async function findAdminWorkspaceMembership(args: {
  workspaceId: string;
  userId: string;
}) {
  const [row] = await adminDb
    .select()
    .from(workspaceMemberTable)
    .where(
      and(
        eq(workspaceMemberTable.user_id, args.userId),
        eq(workspaceMemberTable.workspace_id, args.workspaceId),
      ),
    )
    .limit(1);
  if (!row) return null;
  return { ...row, role: row.role_id };
}

export async function listUserInvitesWithWorkspace(userId: string) {
  const rows = await adminDb
    .select({
      invite: workspaceInviteTable,
      workspace: {
        id: workspaceTable.id,
        name: workspaceTable.name,
      },
    })
    .from(workspaceInviteTable)
    .innerJoin(workspaceTable, eq(workspaceInviteTable.workspace, workspaceTable.id))
    .where(eq(workspaceInviteTable.user_id, userId));

  return rows.map(({ invite, workspace }) => ({
    ...invite,
    workspace: {
      id: workspace.id,
      name: workspace.name ?? "Unnamed workspace",
    },
  }));
}

export async function listUserWorkspaceSummaries(userId: string) {
  const rows = await adminDb
    .select({
      id: workspaceTable.id,
      name: workspaceTable.name,
    })
    .from(workspaceMemberTable)
    .innerJoin(workspaceTable, eq(workspaceMemberTable.workspace_id, workspaceTable.id))
    .where(eq(workspaceMemberTable.user_id, userId))
    .orderBy(desc(workspaceMemberTable.created_at));

  return rows;
}

export async function loadUserWithInvites(userId: string) {
  const [userRow] = await adminDb
    .select()
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);

  if (!userRow) {
    return null;
  }

  const invites = await listUserInvitesWithWorkspace(userId);
  return {
    ...userRow,
    workspace_invite: invites,
  };
}

export async function getWorkspaceCredits(workspaceId: string) {
  const [row] = await adminDb
    .select({ credits: workspaceTable.credits })
    .from(workspaceTable)
    .where(eq(workspaceTable.id, workspaceId))
    .limit(1);
  return row?.credits ?? null;
}

export async function getWorkspaceById(workspaceId: string) {
  const [row] = await adminDb
    .select()
    .from(workspaceTable)
    .where(eq(workspaceTable.id, workspaceId))
    .limit(1);
  return row ?? null;
}

export async function mergeWorkspaceTwilioData(
  workspaceId: string,
  patch: Record<string, unknown>,
) {
  const workspace = await getWorkspaceById(workspaceId);
  if (!workspace) {
    throw new Error("Workspace not found");
  }

  // `twilio_data` is a `text().notNull()` column holding a JSON string, not
  // an object at runtime. Delegate the read-modify-write to the sibling
  // helper in merge-workspace-twilio-data.server.ts, which correctly
  // JSON.parse/JSON.stringify's the column and busts the in-process Twilio
  // credentials cache on write. This preserves this function's external
  // signature/return shape (the full updated workspace row, or null).
  await mergeWorkspaceTwilioDataCore(workspaceId, (current) => ({
    ...current,
    ...patch,
  }));

  return await getWorkspaceById(workspaceId);
}

export async function getWorkspaceWithCampaigns(workspaceId: string) {
  const workspace = await getWorkspaceById(workspaceId);
  if (!workspace) {
    return null;
  }

  const campaigns = await adminDb
    .select()
    .from(campaignTable)
    .where(eq(campaignTable.workspace, workspaceId));

  return {
    ...workspace,
    campaign: campaigns,
  };
}

export async function listWorkspaceNumbersForWorkspace(workspaceId: string) {
  return adminDb
    .select()
    .from(workspaceNumberTable)
    .where(eq(workspaceNumberTable.workspace, workspaceId));
}

export async function listAdminWorkspaceUsersWithUser(workspaceId: string) {
  const rows = await adminDb
    .select({
      id: workspaceMemberTable.id,
      created_at: workspaceMemberTable.created_at,
      role: workspaceMemberTable.role_id,
      user_id: workspaceMemberTable.user_id,
      workspace_id: workspaceMemberTable.workspace_id,
      user: userTable,
    })
    .from(workspaceMemberTable)
    .innerJoin(userTable, eq(workspaceMemberTable.user_id, userTable.id))
    .where(eq(workspaceMemberTable.workspace_id, workspaceId));

  return rows.map(({ user, created_at, ...membership }) => ({
    ...membership,
    created_at: timestampToIsoString(created_at),
    last_accessed: null as string | null,
    user,
  }));
}

export async function findWorkspaceApiKeyByPrefix(keyPrefix: string) {
  const [row] = await adminDb
    .select({
      id: workspaceApiKeyTable.id,
      workspace_id: workspaceApiKeyTable.workspace_id,
      key_hash: workspaceApiKeyTable.key_hash,
      scopes: workspaceApiKeyTable.scopes,
      expires_at: workspaceApiKeyTable.expires_at,
    })
    .from(workspaceApiKeyTable)
    .where(eq(workspaceApiKeyTable.key_prefix, keyPrefix))
    .limit(1);
  return row ?? null;
}

export async function touchWorkspaceApiKeyLastUsed(keyId: string) {
  await adminDb
    .update(workspaceApiKeyTable)
    .set({ last_used_at: new Date().toISOString() })
    .where(eq(workspaceApiKeyTable.id, keyId));
}

/**
 * Real email addresses (from the better-auth identity table) for a
 * workspace's owners and admins. Used for billing/credit notifications.
 *
 * Membership is CHS `workspace_member` (`user_id` text); resolved then joined
 * to `auth_user` by id.
 */
export async function listWorkspaceOwnerAdminEmails(
  workspaceId: string,
): Promise<string[]> {
  const members = await adminDb
    .select({ user_id: workspaceMemberTable.user_id })
    .from(workspaceMemberTable)
    .where(
      and(
        eq(workspaceMemberTable.workspace_id, workspaceId),
        inArray(workspaceMemberTable.role_id, ["owner", "admin"]),
      ),
    );

  const userIds = [...new Set(members.map((member) => member.user_id))].filter(
    Boolean,
  );
  if (userIds.length === 0) {
    return [];
  }

  const rows = await adminDb
    .select({ email: authUser.email })
    .from(authUser)
    .where(inArray(authUser.id, userIds));

  return [...new Set(rows.map((row) => row.email).filter(Boolean))];
}

export async function listUserWorkspaceMembershipsForProfile(userId: string) {
  const rows = await adminDb
    .select({
      last_accessed: workspaceMemberTable.created_at,
      role: workspaceMemberTable.role_id,
      workspace: {
        id: workspaceTable.id,
        name: workspaceTable.name,
        credits: workspaceTable.credits,
        created_at: workspaceTable.created_at,
      },
    })
    .from(workspaceMemberTable)
    .innerJoin(workspaceTable, eq(workspaceMemberTable.workspace_id, workspaceTable.id))
    .where(eq(workspaceMemberTable.user_id, userId))
    .orderBy(desc(workspaceMemberTable.created_at));

  return rows.map((row) => ({
    ...row,
    last_accessed: timestampToIsoStringOrNull(row.last_accessed),
  }));
}

export async function listUserWorkspaceMembershipsWithWorkspace(userId: string) {
  const memberships = await listUserWorkspaceMemberships(userId);
  if (memberships.length === 0) {
    return [];
  }

  const workspaceIds = [...new Set(memberships.map((row) => row.workspace_id))];
  const workspaces = await adminDb
    .select()
    .from(workspaceTable)
    .where(inArray(workspaceTable.id, workspaceIds));
  const workspaceById = new Map(workspaces.map((row) => [row.id, row]));

  return memberships.map((membership) => ({
    ...membership,
    workspace: workspaceById.get(membership.workspace_id) ?? null,
  }));
}
