import { Resend } from "resend";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";

/**
 * SEC-03 invite email (#1713): the ONLY carrier of the raw invitation token.
 * The token is generated at invitation creation, returned exactly once by the
 * package, sent here, and never persisted. Acceptance requires this link.
 */
export async function sendWorkspaceInviteEmail(args: {
  workspaceId: string;
  email: string;
  role: string;
  invitationId: string;
  rawToken: string;
}): Promise<void> {
  const resend = new Resend(env.RESEND_API_KEY());
  const baseUrl = env.BASE_URL();
  const acceptUrl = `${baseUrl}/accept-invite?invitationId=${encodeURIComponent(args.invitationId)}&token=${encodeURIComponent(args.rawToken)}`;

  const subject = "You've been invited to a CallCaster workspace";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>You're invited</h2>
      <p>You've been invited to join a CallCaster workspace as <strong>${args.role}</strong>.</p>
      <p>
        <a href="${acceptUrl}" style="background-color: #c91d25; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Accept invitation</a>
      </p>
      <p>If you don't have an account yet, you'll be asked to create one with this email address.</p>
      <p>If you weren't expecting this invitation, you can ignore this email.</p>
      <p style="color:#888;"><a href="${acceptUrl}">${acceptUrl}</a></p>
    </div>
  `;
  const text = `
    You've been invited to join a CallCaster workspace as ${args.role}.

    Accept the invitation here: ${acceptUrl}

    If you don't have an account yet, you'll be asked to create one with this email address.
    If you weren't expecting this invitation, you can ignore this email.
  `;

  try {
    await resend.emails.send({
      from: "Callcaster <info@callcaster.ca>",
      to: [args.email],
      subject,
      html,
      text,
    });
  } catch (error) {
    // The invite row is already created and the sender saw success; a delivery
    // failure must not surface as an invite failure — log it and let the owner
    // resend from the members list.
    logger.error("send_workspace_invite_email.failed", {
      workspaceId: args.workspaceId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}