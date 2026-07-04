import { eq } from "drizzle-orm";
import { workspace_invite as workspaceInviteTable } from "@/db/schema";
import { findUserIdByUsername, findWorkspaceInviteForUser } from "@/lib/workspace-members-db.server";
import { createTenantDb } from "@/server/tenant-db";

/**
 * Local replacement for the deleted `invite-user-by-email` Edge Function.
 * Creates a workspace_invite record for an existing user.
 * Does NOT send email (email delivery TBD via Better Auth org plugin).
 */
export async function inviteUserByEmail({
  workspaceId,
  email,
  role,
}: {
  workspaceId: string;
  email: string;
  role: string;
}): Promise<
  | { ok: true; invite: { id: string; user_id: string; role: string; workspace: string; created_at: string; isNew: boolean } }
  | { ok: false; error: string }
> {
  const cleanedEmail = email.toLowerCase().trim();
  const userId = await findUserIdByUsername(cleanedEmail);

  if (!userId) {
    return {
      ok: false,
      error: "User not found. They must sign up before being invited to a workspace.",
    };
  }

  const pendingInvite = await findWorkspaceInviteForUser(workspaceId, userId);
  if (pendingInvite) {
    return {
      ok: true,
      invite: {
        id: pendingInvite.id,
        user_id: userId,
        role: pendingInvite.role,
        workspace: workspaceId,
        created_at: pendingInvite.created_at,
        isNew: pendingInvite.isNew,
      },
    };
  }

  const tdb = createTenantDb(workspaceId);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const rows = await tdb.workspace_invite.insert({
    id,
    user_id: userId,
    workspace: workspaceId,
    role,
    created_at: createdAt,
    isNew: true,
  });

  const invite = rows[0];
  if (!invite) {
    return { ok: false, error: "Failed to create workspace invite" };
  }

  return {
    ok: true,
    invite: {
      id: invite.id,
      user_id: invite.user_id,
      role: invite.role,
      workspace: invite.workspace,
      created_at: invite.created_at,
      isNew: invite.isNew,
    },
  };
}
