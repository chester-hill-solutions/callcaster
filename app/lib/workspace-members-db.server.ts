import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  campaign as campaignTable,
  user as userTable,
  webhook as webhookTable,
  workspace as workspaceTable,
  workspace_api_key as workspaceApiKeyTable,
  workspace_invite as workspaceInviteTable,
  workspace_number as workspaceNumberTable,
  workspace_users as workspaceUsersTable,
} from "@/db/schema";
import type { Database } from "@/lib/database.types";
import { adminDb } from "@/server/admin-db";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";

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
    columns: { id: true },
  });
}

export async function listWorkspaceMembersEnriched(workspaceId: string) {
  const rows = await adminDb
    .select({
      role: workspaceUsersTable.role,
      user_id: userTable.id,
      username: userTable.username,
      first_name: userTable.first_name,
      last_name: userTable.last_name,
    })
    .from(workspaceUsersTable)
    .innerJoin(userTable, eq(workspaceUsersTable.user_id, userTable.id))
    .where(eq(workspaceUsersTable.workspace_id, workspaceId));

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
  const rows = await tdb.workspace_users.update({
    set: { role: args.role },
    where: and(
      eq(workspaceUsersTable.user_id, args.userId),
    ),
  });
  return rows[0] ?? null;
}

export async function removeWorkspaceMember(args: {
  workspaceId: string;
  userId: string;
  tdb?: TenantDb;
}) {
  const tdb = args.tdb ?? createTenantDb(args.workspaceId);
  const rows = await tdb.workspace_users.findMany({
    where: eq(workspaceUsersTable.user_id, args.userId),
  });
  const member = rows[0] ?? null;
  if (!member) {
    return null;
  }
  await tdb.workspace_users.delete({
    where: eq(workspaceUsersTable.user_id, args.userId),
  });
  return member;
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
  tdb?: TenantDb;
}) {
  const tdb = args.tdb ?? createTenantDb(args.workspaceId);
  const [newOwner] = await tdb.workspace_users.update({
    set: { role: "owner" },
    where: eq(workspaceUsersTable.user_id, args.newOwnerUserId),
  });
  const [previousOwner] = await tdb.workspace_users.update({
    set: { role: "admin" },
    where: eq(workspaceUsersTable.user_id, args.currentOwnerUserId),
  });
  return { newOwner, previousOwner };
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
    event: args.events,
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
  return tdb.workspace_users.findFirst({
    where: eq(workspaceUsersTable.user_id, userId),
  });
}

export async function insertWorkspaceMembership(args: {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  tdb?: TenantDb;
}) {
  const tdb = args.tdb ?? createTenantDb(args.workspaceId);
  const rows = await tdb.workspace_users.insert({
    user_id: args.userId,
    role: args.role,
    created_at: new Date().toISOString(),
  });
  return rows[0] ?? null;
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
  return adminDb.select().from(workspaceUsersTable);
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
  return adminDb
    .select()
    .from(workspaceUsersTable)
    .where(eq(workspaceUsersTable.user_id, userId));
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
  const rows = await adminDb
    .update(workspaceUsersTable)
    .set({ role: args.role })
    .where(
      and(
        eq(workspaceUsersTable.user_id, args.userId),
        eq(workspaceUsersTable.workspace_id, args.workspaceId),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

export async function deleteAdminWorkspaceMember(args: {
  workspaceId: string;
  userId: string;
}) {
  await adminDb
    .delete(workspaceUsersTable)
    .where(
      and(
        eq(workspaceUsersTable.user_id, args.userId),
        eq(workspaceUsersTable.workspace_id, args.workspaceId),
      ),
    );
}

export async function insertAdminWorkspaceMember(args: {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
}) {
  const rows = await adminDb
    .insert(workspaceUsersTable)
    .values({
      user_id: args.userId,
      workspace_id: args.workspaceId,
      role: args.role,
      created_at: new Date().toISOString(),
    })
    .returning();
  return rows[0] ?? null;
}

export async function findAdminWorkspaceMembership(args: {
  workspaceId: string;
  userId: string;
}) {
  const [row] = await adminDb
    .select()
    .from(workspaceUsersTable)
    .where(
      and(
        eq(workspaceUsersTable.user_id, args.userId),
        eq(workspaceUsersTable.workspace_id, args.workspaceId),
      ),
    )
    .limit(1);
  return row ?? null;
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
    .from(workspaceUsersTable)
    .innerJoin(workspaceTable, eq(workspaceUsersTable.workspace_id, workspaceTable.id))
    .where(eq(workspaceUsersTable.user_id, userId))
    .orderBy(desc(workspaceUsersTable.last_accessed));

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
