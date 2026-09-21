import {
  appRowToView,
  createWorkspaceInvitation,
  getPendingWorkspaceInvitationByEmail,
  toWorkspaceInvitationView,
  type InvitationRole,
  type WorkspaceInvitationView,
} from "@/lib/workspace-invitations.server";
import { sendWorkspaceInviteEmail } from "@/lib/send-workspace-invite-email.server";
import { logger } from "@/lib/logger.server";

export type InviteUserByEmailResult =
  | {
      ok: true;
      invite: WorkspaceInvitationView;
      warning?: string;
    }
  | { ok: false; error: string; status: number };

/**
 * SEC-03 email-first invite writer (#1713): a workspace invite is keyed by a
 * normalized email and no longer requires the invitee to already have an
 * account. The emailed link carries the one-time raw token used to accept.
 */
export async function inviteUserByEmail({
  workspaceId,
  email,
  role,
  invitedByUserId,
}: {
  workspaceId: string;
  email: string;
  role: InvitationRole;
  invitedByUserId: string;
}): Promise<InviteUserByEmailResult> {
  const cleanedEmail = email.toLowerCase().trim();

  const pendingInvite = await getPendingWorkspaceInvitationByEmail({
    workspaceId,
    email: cleanedEmail,
  });
  if (pendingInvite) {
    return {
      ok: true,
      invite: appRowToView(pendingInvite, workspaceId),
      warning: "An invite is already pending for this email.",
    };
  }

  try {
    const { invitation, rawToken } = await createWorkspaceInvitation({
      workspaceId,
      email: cleanedEmail,
      role,
      invitedByUserId,
    });

    await sendWorkspaceInviteEmail({
      workspaceId,
      email: cleanedEmail,
      role: invitation.roleId,
      invitationId: invitation.id,
      rawToken,
    });

    return {
      ok: true,
      invite: toWorkspaceInvitationView(invitation, workspaceId),
    };
  } catch (error) {
    logger.error("invite_user_by_email.failed", {
      workspaceId,
      email: cleanedEmail,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      error: "Could not create the invitation. Please try again.",
      status: 500,
    };
  }
}