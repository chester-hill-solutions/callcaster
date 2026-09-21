import { and, eq, gt } from "drizzle-orm";
import {
  cancelInvitation,
  createInvitation,
  listPendingInvitations,
  redeemInvitation,
  resendInvitation,
  type WorkspaceInvitationRow,
} from "@chester-hill-solutions/auth-postgres";
import { AuthzError } from "@chester-hill-solutions/auth";
import {
  user as userTable,
  workspace as workspaceTable,
  workspace_invitation as workspaceInvitationTable,
} from "@/db/schema";
import { eqChsTextToUuid } from "@/lib/chs-uuid-text.server";
import { workspaceMemberId } from "@/lib/workspace-membership.server";

/**
 * SEC-03 email-first workspace invitations (2026-09-21, #1713).
 *
 * Invites no longer require the invitee to already have an account. An invite
 * is keyed by a normalized email on the CHS `workspace_invitation` table and
 * carries a one-time raw token that is ONLY delivered by email (never stored —
 * the table holds the SHA-256 token hash). Redemption matches the
 * authenticated user's email against the invite and consumes it atomically
 * (CAS on status) while inserting the `workspace_member` row in the same
 * transaction.
 *
 * Acceptance is token-gated by design: the settings/members list may show
 * pending invites, but the actual accept happens through the emailed link.
 * That stops an attacker who signs up with a victim's email (signup does not
 * enforce email verification) from claiming the workspace invite without
 * first holding the emailed token — proof of mailbox ownership.
 */

/** Product role strings accepted by writers; role_id equals the string. */
export type InvitationRole = "owner" | "admin" | "member" | "caller";

/** Snake_case view of a CHS invitation row as exposed to app routes. */
export type WorkspaceInvitationView = {
  id: string;
  email: string;
  role: string;
  status: string;
  workspace: string;
  created_at: string;
  expires_at: string | null;
  isNew: boolean;
};

export type WorkspaceInvitationAppRow =
  typeof workspaceInvitationTable.$inferSelect;

/**
 * The invitation table is a global (unscoped) table: callers already filter by
 * workspace. The admin client is imported lazily so unit tests that mock the
 * service modules above this one never force a DATABASE_URL at import time.
 */
let adminDbPromise:
  | Promise<typeof import("@/server/admin-db")["adminDb"]>
  | undefined;
function adminDbClient() {
  adminDbPromise ??= import("@/server/admin-db").then((m) => m.adminDb);
  return adminDbPromise;
}

function toView(
  row: WorkspaceInvitationRow,
  workspaceId?: string,
): WorkspaceInvitationView {
  return {
    id: row.id,
    email: row.email,
    role: row.roleId,
    status: row.status,
    workspace: workspaceId ?? row.workspaceId,
    created_at: row.createdAt.toISOString(),
    expires_at: row.expiresAt ? row.expiresAt.toISOString() : null,
    isNew: true,
  };
}

export async function createWorkspaceInvitation(args: {
  workspaceId: string;
  email: string;
  role: InvitationRole;
  invitedByUserId: string;
}) {
  const db = await adminDbClient();
  const { invitation, rawToken } = await createInvitation(db, {
    id: `wi_${crypto.randomUUID()}`,
    workspaceId: args.workspaceId,
    email: args.email,
    roleId: args.role,
    invitedByUserId: args.invitedByUserId,
  });
  return { invitation, rawToken };
}

export async function getPendingWorkspaceInvitationByEmail(args: {
  workspaceId: string;
  email: string;
}): Promise<WorkspaceInvitationAppRow | null> {
  const db = await adminDbClient();
  const email = args.email.toLowerCase().trim();
  const [row] = await db
    .select()
    .from(workspaceInvitationTable)
    .where(
      and(
        eq(workspaceInvitationTable.workspace_id, args.workspaceId),
        eq(workspaceInvitationTable.email, email),
        eq(workspaceInvitationTable.status, "pending"),
        gt(workspaceInvitationTable.expires_at, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getWorkspaceInvitationById(
  invitationId: string,
): Promise<WorkspaceInvitationAppRow | null> {
  const db = await adminDbClient();
  const [row] = await db
    .select()
    .from(workspaceInvitationTable)
    .where(eq(workspaceInvitationTable.id, invitationId))
    .limit(1);
  return row ?? null;
}

export async function listWorkspaceInvitations(workspaceId: string) {
  const db = await adminDbClient();
  const rows = await listPendingInvitations(db, workspaceId);
  return rows.map((row) => toView(row, workspaceId));
}

export async function cancelWorkspaceInvitationById(invitationId: string) {
  const db = await adminDbClient();
  await cancelInvitation(db, invitationId);
}

export async function resendWorkspaceInvitation(invitationId: string) {
  const db = await adminDbClient();
  return resendInvitation(db, invitationId);
}

export async function redeemWorkspaceInvitation(args: {
  invitationId: string;
  rawToken: string;
  userId: string;
  verifiedEmail: string;
}): Promise<
  | { ok: true; workspaceId: string; alreadyAccepted: boolean }
  | { ok: false; error: string; status: number }
> {
  try {
    const db = await adminDbClient();
    const invite = await getWorkspaceInvitationById(args.invitationId);
    if (!invite) {
      return { ok: false, error: "Invitation not found.", status: 404 };
    }
    const result = await redeemInvitation(db, {
      invitationId: args.invitationId,
      rawToken: args.rawToken,
      userId: args.userId,
      verifiedEmail: args.verifiedEmail,
      membershipId: workspaceMemberId(invite.workspace_id, args.userId),
    });
    return {
      ok: true,
      workspaceId: invite.workspace_id,
      alreadyAccepted: result.alreadyAccepted,
    };
  } catch (error) {
    const status = error instanceof AuthzError ? error.status || 400 : 500;
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not accept the invitation.",
      status,
    };
  }
}

/** Pending invites for one workspace, snake_case, unexpired only. */
export function toWorkspaceInvitationView(
  row: WorkspaceInvitationRow,
): WorkspaceInvitationView {
  return toView(row);
}

type PendingInvitationJoin = {
  invite: typeof workspaceInvitationTable.$inferSelect;
  workspace: typeof workspaceTable.$inferSelect;
};

/** Shared email-first pending-invite query: invite + hosting workspace. */
async function queryPendingInvitationsByEmail(
  email: string,
): Promise<PendingInvitationJoin[]> {
  const cleaned = email.toLowerCase().trim();
  if (!cleaned) {
    return [];
  }
  const db = await adminDbClient();
  return db
    .select({
      invite: workspaceInvitationTable,
      workspace: workspaceTable,
    })
    .from(workspaceInvitationTable)
    .innerJoin(
      workspaceTable,
      eqChsTextToUuid(workspaceInvitationTable.workspace_id, workspaceTable.id),
    )
    .where(
      and(
        eq(workspaceInvitationTable.email, cleaned),
        eq(workspaceInvitationTable.status, "pending"),
        gt(workspaceInvitationTable.expires_at, new Date()),
      ),
    );
}

/** Raw pending invites (invite + hosting workspace) for an email (admin console). */
export async function listPendingInvitesForUsername(username: string) {
  return queryPendingInvitationsByEmail(username);
}

/** Pending invites for a user's auth email, joined with the inviting workspace. */
export async function listUserInvitesWithWorkspace(userId: string) {
  const db = await adminDbClient();
  const [userRow] = await db
    .select({ username: userTable.username })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  const email = userRow?.username?.toLowerCase().trim();
  if (!email) {
    return [];
  }
  const rows = await queryPendingInvitationsByEmail(email);
  return rows.map(({ invite, workspace }) => ({
    ...invite,
    workspace: {
      id: workspace.id,
      name: workspace.name ?? "Unnamed workspace",
    },
  }));
}

/**
 * Pending workspace invitations for a user by their auth email, mapped to a
 * route-ready display shape. Email-first replacement for the legacy
 * user-id-keyed invite list (#1713 / SEC-03).
 */
export async function listUserPendingInvitationsByEmail(email: string) {
  const rows = await queryPendingInvitationsByEmail(email);
  return rows.map(({ invite, workspace }) => ({
    id: invite.id,
    email: invite.email,
    role: invite.role_id,
    status: invite.status,
    created_at: invite.created_at.toISOString(),
    expires_at: invite.expires_at ? invite.expires_at.toISOString() : null,
    workspace: {
      id: workspace.id,
      name: workspace.name ?? "Unnamed workspace",
    },
  }));
}