import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse, routeArgs } from "./helpers/route-result";
import { resetRateLimitsForTests } from "@/lib/platform-rate-limit.server";

const fixtures = vi.hoisted(() => {
  const database: Record<string, Record<string, unknown>[]> = {
    user: [],
    account: [],
    session: [],
    verification: [],
  };
  return {
    database,
    send: vi.fn(async (_message: unknown) => ({
      data: { id: "reset-email" },
      error: null,
    })),
  };
});
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: fixtures.send };
  },
}));
vi.mock("@/lib/env.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env.server")>()),
  env: {
    ...(await importOriginal<typeof import("@/lib/env.server")>()).env,
    BASE_URL: () => "http://localhost",
    RESEND_API_KEY: () => "test-key",
  },
}));
vi.mock("@/server/auth-instance", async (importOriginal) => {
  const { betterAuth } = await import("better-auth");
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  const { sendResetPasswordEmail } =
    await import("@/lib/send-reset-password-email.server");
  return {
    ...(await importOriginal<typeof import("@/server/auth-instance")>()),
    auth: betterAuth({
      baseURL: "http://localhost/api/auth",
      secret: "password-recovery-test-secret-with-32-characters",
      database: memoryAdapter(fixtures.database),
      emailAndPassword: {
        enabled: true,
        sendResetPassword: sendResetPasswordEmail,
        revokeSessionsOnPasswordReset: true,
      },
      rateLimit: { enabled: false },
      logger: { disabled: true },
    }),
  };
});

async function requestRecovery(
  email = "owner@example.com",
  origin = "http://localhost",
) {
  const { action } = await import("../app/routes/remember.action.server");
  const form = new FormData();
  form.set("email", email);
  return asRouteResponse(
    action(
      routeArgs(
        new Request(`${origin}/remember`, { method: "POST", body: form }),
      ),
    ),
  );
}
async function issuedLink() {
  await requestRecovery();
  expect(fixtures.send).toHaveBeenCalledTimes(1);
  const mail = fixtures.send.mock.calls[0]?.[0];
  if (
    !mail ||
    typeof mail !== "object" ||
    !("text" in mail) ||
    typeof mail.text !== "string"
  )
    throw new Error("Reset email missing");
  const link = mail.text.match(/Reset it here: (\S+)/)?.[1];
  if (!link) throw new Error("Reset link missing");
  return link;
}
async function submitPassword(url: string) {
  const { action } = await import("../app/routes/reset-password.action.server");
  const form = new FormData();
  form.set("password", "new-password-2075");
  form.set("confirmPassword", "new-password-2075");
  return asRouteResponse(
    action(routeArgs(new Request(url, { method: "POST", body: form }))),
  );
}

describe("password recovery through the actual issued email and installed Better Auth", () => {
  beforeEach(async () => {
    for (const rows of Object.values(fixtures.database)) rows.splice(0);
    fixtures.send.mockClear();
    resetRateLimitsForTests();
    const { auth } = await import("@/server/auth-instance");
    await auth.api.signUpEmail({
      body: {
        name: "Owner",
        email: "owner@example.com",
        password: "old-password-2075",
      },
    });
  });
  test("the issued link keeps its token through the password form, changes the password and cannot be replayed", async () => {
    const { auth } = await import("@/server/auth-instance");
    const link = await issuedLink();
    const { loader: callbackLoader } =
      await import("../app/routes/api+/auth/$.loader.server");
    const callback = await asRouteResponse(
      callbackLoader(routeArgs(new Request(link))),
    );
    expect(callback.status).toBe(302);
    const destination = callback.headers.get("Location");
    if (!destination) throw new Error("Reset callback did not redirect");
    const url = new URL(destination);
    expect(url.pathname).toBe("/reset-password");
    const issuedToken = new URL(link).pathname.split("/").at(-1);
    expect(url.searchParams.get("token")).toBe(issuedToken);
    const { loader } =
      await import("../app/routes/reset-password.loader.server");
    const page = await asRouteResponse(loader(routeArgs(new Request(url))));
    await expect(page.json()).resolves.toEqual({ token: issuedToken });
    const changed = await submitPassword(url.href);
    await expect(changed.json()).resolves.toEqual({
      success: true,
      error: null,
    });
    await expect(
      auth.api.signInEmail({
        body: { email: "owner@example.com", password: "old-password-2075" },
      }),
    ).rejects.toThrow();
    await expect(
      auth.api.signInEmail({
        body: { email: "owner@example.com", password: "new-password-2075" },
      }),
    ).resolves.toMatchObject({ user: { email: "owner@example.com" } });
    expect((await submitPassword(url.href)).status).toBe(400);
  });
  test("unknown and known emails receive identical generic acceptance", async () => {
    const known = await requestRecovery();
    const unknown = await requestRecovery("unknown@example.com");
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await unknown.json()).toEqual(await known.json());
    expect(fixtures.send).toHaveBeenCalledTimes(1);
  });
  test("the configured destination resists a caller-selected request host", async () => {
    await requestRecovery("owner@example.com", "http://attacker.invalid");
    const mail = fixtures.send.mock.calls[0]?.[0];
    if (
      !mail ||
      typeof mail !== "object" ||
      !("text" in mail) ||
      typeof mail.text !== "string"
    )
      throw new Error("Reset email missing");
    expect(mail.text).toContain(
      "callbackURL=http%3A%2F%2Flocalhost%2Freset-password",
    );
    expect(mail.text).not.toContain("attacker.invalid");
  });
  test("expired issued links return to the password page without a usable token", async () => {
    const { auth } = await import("@/server/auth-instance");
    const link = await issuedLink();
    const row = fixtures.database.verification[0];
    if (!row) throw new Error("Verification missing");
    row.expiresAt = new Date(0);
    const { loader: callbackLoader } =
      await import("../app/routes/api+/auth/$.loader.server");
    const response = await asRouteResponse(
      callbackLoader(routeArgs(new Request(link))),
    );
    const destination = new URL(
      response.headers.get("Location") ?? "http://invalid",
    );
    expect(response.status).toBe(302);
    expect(destination.pathname).toBe("/reset-password");
    expect(destination.searchParams.get("error")).toBe("INVALID_TOKEN");
    expect(destination.searchParams.has("token")).toBe(false);
    expect(
      (await submitPassword("http://localhost/reset-password?token=invalid"))
        .status,
    ).toBe(400);
  });
  test("reset request throttling stops additional email and token creation", async () => {
    for (let i = 0; i < 10; i++)
      expect((await requestRecovery()).status).toBe(200);
    const before = fixtures.database.verification.length;
    expect((await requestRecovery()).status).toBe(429);
    expect(fixtures.send).toHaveBeenCalledTimes(10);
    expect(fixtures.database.verification).toHaveLength(before);
  });
});
