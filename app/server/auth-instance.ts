import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins";
import { db } from "./db";
import * as authSchema from "../db/auth-schema";
import { resolveAuthTrustedOrigins } from "@/lib/auth-trusted-origins.server";
import { env, isTwoFactorFeatureEnabled } from "@/lib/env.server";
import { ensureProfileForUser } from "@/lib/ensure-user-profile.server";
import { sendResetPasswordEmail } from "@/lib/send-reset-password-email.server";
import {
  sendVerificationEmail,
  sendAccountExistsEmail,
} from "@/lib/send-verification-email.server";
import { MIN_PASSWORD_LENGTH } from "../../shared/auth-policy";

let authInstance: ReturnType<typeof createAuth> | null = null;

function createAuth() {
  return betterAuth({
    appName: "CallCaster",
    baseURL: env.BETTER_AUTH_URL(),
    secret: env.BETTER_AUTH_SECRET(),
    // Localtunnel / review hosts: browser Origin is often loopback or a different
    // public host than BASE_URL. Resolve per-request so signup/sign-in CSRF passes.
    trustedOrigins: resolveAuthTrustedOrigins,
    emailAndPassword: {
      enabled: true,
      // Signup used to hand out a session against an address nobody had
      // proved they control, and the `/api/auth/verify-email` route could
      // never be reached because no token was ever issued (#2216). Requiring
      // verification closes that, and makes the route and the emailVerified
      // column do the job they were built for.
      //
      // The cost is real and lives in the callers: signUpEmail stops returning
      // a session, so signup (app/routes/signup.action.server.ts) and invitation
      // signup (app/routes/accept-invite.action.server.ts) must show a pending
      // state, and sign-in maps EMAIL_NOT_VERIFIED instead of succeeding.
      requireEmailVerification: true,
      // Better Auth answers a duplicate sign-up with a synthetic user and no
      // error, so the form cannot be used to test whether an address is
      // registered (sign-up.mjs). Nothing else runs on that path — no token, no
      // mail — so this callback is what keeps the pending state's promise true
      // for the address that already has an account (#2216).
      onExistingUserSignUp: sendAccountExistsEmail,
      // Stated rather than inherited: Better Auth's default happens to be 8 and
      // the signup form and public API schema both declare 8. One shared
      // constant keeps the reset form, signup, and the library in agreement
      // (shared/auth-policy.ts).
      minPasswordLength: MIN_PASSWORD_LENGTH,
      // Without this, Better Auth's requestPasswordReset endpoint throws
      // RESET_PASSWORD_DISABLED before ever writing an auth_verification
      // row — forgot-password was completely dead (P0-7). See
      // app/lib/send-reset-password-email.server.ts.
      sendResetPassword: sendResetPasswordEmail,
      // A reset is usually a response to suspected compromise; the sessions
      // that already exist are exactly the ones that must stop working.
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: {
      // Delivery. Without this callback Better Auth has a token and nowhere to
      // send it, and requireEmailVerification above becomes a lockout.
      sendVerificationEmail,
      // requireEmailVerification already implies this (sign-up.mjs), but an
      // auditor asking "is the email actually sent on signup?" should not have
      // to know that, so it is stated.
      sendOnSignUp: true,
      // The resend path, and it needs no new endpoint: a sign-in attempt that
      // gets the password right but the address unverified re-sends the link.
      // Better Auth only re-sends after the password verifies, so this is not
      // an address-probing oracle.
      sendOnSignIn: true,
      // Confirming the address signs the user in, so the funnel is
      // submit → confirm → inside the app. Without it the link would verify
      // the address, drop the user on /workspaces with no session, and bounce
      // them to sign-in — the same dead end the pending state exists to avoid.
      autoSignInAfterVerification: true,
    },
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        auth_user: authSchema.authUser,
        auth_session: authSchema.authSession,
        auth_account: authSchema.authAccount,
        auth_verification: authSchema.authVerification,
        auth_two_factor: authSchema.authTwoFactor,
      },
    }),
    databaseHooks: {
      user: {
        create: {
          // Mirror auth_user → public.user so domain FKs (workspace_users, etc.) succeed.
          after: async (user) => {
            await ensureProfileForUser(user);
          },
        },
      },
    },
    advanced: {
      database: {
        // Domain tables key users by uuid (e.g. create_new_workspace casts
        // $2::uuid), so auth ids must be uuids, not Better Auth's nanoids.
        generateId: () => crypto.randomUUID(),
      },
    },
    // With the plugin absent, sign-in issues a full session for everyone and
    // never returns a twoFactorRedirect, whatever auth_two_factor holds.
    plugins: isTwoFactorFeatureEnabled()
      ? [
          twoFactor({
            twoFactorTable: "auth_two_factor",
          }),
        ]
      : [],
    user: {
      modelName: "auth_user",
    },
    session: {
      modelName: "auth_session",
    },
    account: {
      modelName: "auth_account",
    },
    verification: {
      modelName: "auth_verification",
    },
  });
}

export const auth = new Proxy({} as ReturnType<typeof createAuth>, {
  get(_target, prop) {
    if (!authInstance) {
      authInstance = createAuth();
    }
    return authInstance[prop as keyof ReturnType<typeof createAuth>];
  },
});
