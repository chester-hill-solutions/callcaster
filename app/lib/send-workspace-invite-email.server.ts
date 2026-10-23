import { renderBrandedEmail } from "@/lib/email-layout.server";
import { env } from "@/lib/env.server";
import { sendTransactionalEmail } from "@/lib/transactional-email.server";

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
  const baseUrl = env.BASE_URL();
  const acceptUrl = `${baseUrl}/accept-invite?invitationId=${encodeURIComponent(args.invitationId)}&token=${encodeURIComponent(args.rawToken)}`;

  const subject = "You've been invited to a CallCaster workspace";
  const { html, text } = renderBrandedEmail({
    heading: "You're invited to a CallCaster workspace",
    intro: `You've been invited to join a CallCaster workspace as ${args.role}.`,
    note: {
      text: "If you don't have an account yet, you'll be asked to create one with this email address.",
    },
    cta: { label: "Accept invitation", url: acceptUrl },
  });

  // The invite row is already created and the sender saw success; a delivery
  // failure must not surface as an invite failure — log it and let the owner
  // resend from the members list.
  await sendTransactionalEmail({
    to: args.email,
    subject,
    html,
    text,
  });
}