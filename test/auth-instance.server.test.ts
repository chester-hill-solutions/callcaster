import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  betterAuth: vi.fn((options: unknown) => ({ __options: options })),
}));

vi.mock("better-auth", () => ({
  betterAuth: mocks.betterAuth,
}));

vi.mock("better-auth/adapters/drizzle", () => ({
  drizzleAdapter: vi.fn(() => ({})),
}));

vi.mock("better-auth/plugins", () => ({
  twoFactor: vi.fn(() => ({ id: "two-factor" })),
}));

vi.mock("@/server/db", () => ({ db: {} }));

vi.mock("@/db/auth-schema", () => ({
  authUser: {},
  authSession: {},
  authAccount: {},
  authVerification: {},
  authTwoFactor: {},
}));

vi.mock("@/lib/auth-trusted-origins.server", () => ({
  resolveAuthTrustedOrigins: vi.fn(),
}));

vi.mock("@/lib/env.server", () => ({
  env: new Proxy({}, { get: () => () => "test" }),
  isTwoFactorFeatureEnabled: () => process.env.TWO_FACTOR_ENABLED === "1",
}));

vi.mock("@/lib/ensure-user-profile.server", () => ({
  ensureProfileForUser: vi.fn(),
}));

vi.mock("@/lib/send-reset-password-email.server", () => ({
  sendResetPasswordEmail: vi.fn(),
}));

describe("app/server/auth-instance.ts", () => {
  test("registers the twoFactor plugin only when TWO_FACTOR_ENABLED is set", async () => {
    const saved = process.env.TWO_FACTOR_ENABLED;
    try {
      process.env.TWO_FACTOR_ENABLED = "1";
      let mod = await import("../app/server/auth-instance");
      void mod.auth.api;
      let options = mocks.betterAuth.mock.calls.at(-1)?.[0] as { plugins?: unknown[] };
      expect(options.plugins).toHaveLength(1);

      vi.resetModules();
      mocks.betterAuth.mockClear();
      delete process.env.TWO_FACTOR_ENABLED;
      mod = await import("../app/server/auth-instance");
      void mod.auth.api;
      options = mocks.betterAuth.mock.calls.at(-1)?.[0] as { plugins?: unknown[] };
      // No plugin means sign-in never issues a twoFactorRedirect, for anyone.
      expect(options.plugins).toEqual([]);
    } finally {
      process.env.TWO_FACTOR_ENABLED = saved;
    }
  });

  beforeEach(() => {
    vi.resetModules();
    mocks.betterAuth.mockClear();
  });

  test("wires emailAndPassword.sendResetPassword so forgot-password isn't dead (P0-7)", async () => {
    // Regression test: without a sendResetPassword callback, Better Auth's
    // requestPasswordReset endpoint throws RESET_PASSWORD_DISABLED before
    // ever writing an auth_verification row (see
    // node_modules/better-auth/dist/api/routes/password.mjs) — forgot-password
    // silently never sent an email and never created a resettable token.
    const { auth } = await import("../app/server/auth-instance");
    // Force the lazily-constructed betterAuth() call via the Proxy.
    void auth.api;

    expect(mocks.betterAuth).toHaveBeenCalledTimes(1);
    const options = mocks.betterAuth.mock.calls[0]![0] as {
      emailAndPassword?: {
        enabled?: boolean;
        sendResetPassword?: unknown;
      };
    };

    expect(options.emailAndPassword?.enabled).toBe(true);
    expect(typeof options.emailAndPassword?.sendResetPassword).toBe("function");

    const { sendResetPasswordEmail } = await import(
      "../app/lib/send-reset-password-email.server"
    );
    expect(options.emailAndPassword?.sendResetPassword).toBe(sendResetPasswordEmail);
  });

  test("a password reset revokes every existing session for the user", async () => {
    // Better Auth only calls deleteUserSessions on reset when this flag is set
    // (node_modules/better-auth/dist/api/routes/password.mjs); without it an
    // attacker's session survives the very reset meant to evict them.
    const { auth } = await import("../app/server/auth-instance");
    void auth.api;
    const options = mocks.betterAuth.mock.calls.at(0)?.[0] as {
      emailAndPassword?: { revokeSessionsOnPasswordReset?: boolean };
    };
    expect(options.emailAndPassword?.revokeSessionsOnPasswordReset).toBe(true);
  });
});
