import { Resend } from "resend";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";

/**
 * Better Auth's `emailAndPassword.sendResetPassword` callback. Without this
 * configured, Better Auth's `requestPasswordReset` endpoint throws
 * `RESET_PASSWORD_DISABLED` before it ever writes an `auth_verification` row
 * (see node_modules/better-auth/dist/api/routes/password.mjs), so forgot-password
 * was completely dead: no token, no email, no way to recover an account.
 *
 * Reuses the same `resend` package + `RESEND_API_KEY` the rest of the app's
 * transactional email already relies on (see app/lib/low-credit-notify.server.ts,
 * app/lib/number-rental-billing.server.ts, app/lib/twilio-compliance-notify.server.ts)
 * rather than introducing a new email dependency.
 */
export async function sendResetPasswordEmail(
  { user, url }: { user: { email: string }; url: string; token: string },
  _request?: Request,
): Promise<void> {
  const resend = new Resend(env.RESEND_API_KEY());

  const subject = "Reset your CallCaster password";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Reset your password</h2>
      <p>We received a request to reset the password for your CallCaster account.</p>
      <p>
        <a href="${url}" style="background-color: #c91d25; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset password</a>
      </p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;
  const text = `
    Reset your password

    We received a request to reset the password for your CallCaster account.
    Reset it here: ${url}

    If you didn't request this, you can safely ignore this email.
  `;

  try {
    await resend.emails.send({
      from: "Callcaster <info@callcaster.ca>",
      to: [user.email],
      subject,
      html,
      text,
    });
  } catch (error) {
    // Better Auth's requestPasswordReset endpoint already returns a generic
    // "if this email exists..." response regardless of send outcome, so a
    // delivery failure here shouldn't surface to the caller — just log it so
    // it isn't silently invisible.
    logger.error("send_reset_password_email.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
