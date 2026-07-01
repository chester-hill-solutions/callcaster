import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import * as authSchema from "../db/auth-schema";
import { env } from "@/lib/env.server";

let authInstance: any = null;

function createAuth() {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL(),
    secret: env.BETTER_AUTH_SECRET(),
    emailAndPassword: {
      enabled: true,
    },
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: authSchema.authUser,
        session: authSchema.authSession,
        account: authSchema.authAccount,
        verification: authSchema.authVerification,
      },
    }),
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

export const auth: any = new Proxy({} as any, {
  get(_target, prop) {
    if (!authInstance) {
      authInstance = createAuth();
    }
    return (authInstance as any)[prop];
  },
});
