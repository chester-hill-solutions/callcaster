import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins";
import { db } from "./db";
import * as authSchema from "../db/auth-schema";
import { resolveAuthTrustedOrigins } from "@/lib/auth-trusted-origins.server";
import { env } from "@/lib/env.server";
import { ensureProfileForUser } from "@/lib/ensure-user-profile.server";
import { sendResetPasswordEmail } from "@/lib/send-reset-password-email.server";

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
      // Without this, Better Auth's requestPasswordReset endpoint throws
      // RESET_PASSWORD_DISABLED before ever writing an auth_verification
      // row — forgot-password was completely dead (P0-7). See
      // app/lib/send-reset-password-email.server.ts.
      sendResetPassword: sendResetPasswordEmail,
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
    plugins: [
      twoFactor({
        twoFactorTable: "auth_two_factor",
      }),
    ],
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
