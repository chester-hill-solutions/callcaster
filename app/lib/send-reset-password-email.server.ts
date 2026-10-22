import { renderBrandedEmail } from "@/lib/email-layout.server";
import { sendTransactionalEmail } from "@/lib/transactional-email.server";

/**
 * Better Auth's `emailAndPassword.sendResetPassword` callback. Without this
 * configured, Better Auth's `requestPasswordReset` endpoint throws
 * `RESET_PASSWORD_DISABLED` before it ever writes an `auth_verification` row
 * (see node_modules/better-auth/dist/api/routes/password.mjs), so forgot-password
 * was completely dead: no token, no email, no way to recover an account.
 *
 * Delivery goes through the shared transactional-email path (Resend +
 * `RESEND_API_KEY`). Better Auth's requestPasswordReset endpoint already
 * returns a generic "if this email exists..." response regardless of send
 * outcome, so this must never throw to it.
 */
export async function sendResetPasswordEmail(
  { user, url }: { user: { email: string }; url: string; token: string },
  _request?: Request,
): Promise<void> {
  const subject = "Reset your CallCaster password";
  const { html, text } = renderBrandedEmail({
    heading: "Reset your password",
    intro:
      "We received a request to reset the password for your CallCaster account.",
    note: {
      text: "If you didn't request this, you can safely ignore this email.",
    },
    cta: { label: "Reset password", url },
  });

  await sendTransactionalEmail({
    to: user.email,
    subject,
    html,
    text,
  });
}