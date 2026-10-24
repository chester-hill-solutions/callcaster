import { renderBrandedEmail } from "@/lib/email-layout.server";
import { sendTransactionalEmail } from "@/lib/transactional-email.server";
import { env } from "@/lib/env.server";

/**
 * Better Auth's `emailVerification.sendVerificationEmail` callback. Without it
 * there is no token and no delivery, and `requireEmailVerification` would lock
 * every account out of its own sign-in (#2216).
 *
 * Better Auth builds `${baseURL}/verify-email?token=…` for the callback URL.
 * This app does not serve that as a GET: `/api/auth/verify-email` is the JSON
 * POST twin (app/routes/api+/auth/verify-email.route.tsx), so a GET there finds
 * no loader. The CTA is repointed at `/auth/confirm`, the surface that already
 * consumes a verification token and merges the session cookies Better Auth sets
 * when `autoSignInAfterVerification` is on.
 *
 * The origin is taken from the URL Better Auth built, which derives from
 * `BETTER_AUTH_URL`/`BASE_URL`. It is never taken from the request host: a
 * verification mail that honours a caller-selected host would mail a link to
 * the attacker's origin.
 */
export function verificationUrlFrom(link: string, token: string): string {
  const target = new URL(link);
  target.pathname = "/auth/confirm";
  target.search = "";
  target.searchParams.set("token_hash", token);
  target.searchParams.set("type", "email");
  target.searchParams.set("next", "/workspaces");
  return target.toString();
}

export async function sendVerificationEmail(
  { user, url, token }: { user: { email: string }; url: string; token: string },
  _request?: Request,
): Promise<void> {
  const link = verificationUrlFrom(url, token);
  const { html, text } = renderBrandedEmail({
    heading: "Verify your email address",
    intro: "Confirm this address to finish setting up your CallCaster account.",
    note: {
      text: "If you didn't create a CallCaster account, you can ignore this email.",
    },
    cta: { label: "Verify email", url: link },
  });

  await sendTransactionalEmail({
    to: user.email,
    subject: "Verify your CallCaster email",
    html,
    text,
  });
}

/**
 * Better Auth's `emailAndPassword.onExistingUserSignUp` callback.
 *
 * With `requireEmailVerification` on, a sign-up for an address that already has
 * an account is answered with a synthetic user instead of an error, so the form
 * cannot be used to test whether an address is registered (sign-up.mjs). Nothing
 * else runs on that path — no token, no mail — so the pending state would be
 * promising an email nobody sent, which is the half-wired promise this change
 * exists to end (#2216).
 *
 * The page copy is deliberately the same for both outcomes, so it leaks nothing;
 * this email is what makes it true.
 */
export async function sendAccountExistsEmail(
  { user }: { user: { email: string } },
  _request?: Request,
): Promise<void> {
  const link = new URL("/signin", env.BASE_URL()).toString();
  const { html, text } = renderBrandedEmail({
    heading: "You already have a CallCaster account",
    intro:
      "Someone just tried to sign up with this email address. If that was you, sign in instead — your account is already here.",
    note: {
      text: "If it wasn't you, nothing was created and nothing changed. You can ignore this email.",
    },
    cta: { label: "Sign in", url: link },
  });

  await sendTransactionalEmail({
    to: user.email,
    subject: "You already have a CallCaster account",
    html,
    text,
  });
}
