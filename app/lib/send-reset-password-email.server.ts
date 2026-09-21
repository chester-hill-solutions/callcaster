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

  await sendTransactionalEmail({
    to: user.email,
    subject,
    html,
    text,
  });
}