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
      data: { id: "verify-email" },
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

/**
 * app/server/auth-instance.ts's own configuration is asserted in
 * test/auth-instance.server.test.ts. This file re-states it on an in-memory
 * adapter so the *behaviour* of that configuration can be exercised without
 * Postgres — the split the password-recovery journey already uses.
 */
vi.mock("@/server/auth-instance", async (importOriginal) => {
  const { betterAuth } = await import("better-auth");
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  const { sendVerificationEmail, sendAccountExistsEmail } =
    await import("@/lib/send-verification-email.server");
  return {
    ...(await importOriginal<typeof import("@/server/auth-instance")>()),
    auth: betterAuth({
      baseURL: "http://localhost/api/auth",
      secret: "email-verification-test-secret-with-32-chars",
      database: memoryAdapter(fixtures.database),
      emailAndPassword: {
        enabled: true,
        requireEmailVerification: true,
        onExistingUserSignUp: sendAccountExistsEmail,
      },
      emailVerification: {
        sendVerificationEmail,
        sendOnSignUp: true,
        sendOnSignIn: true,
        autoSignInAfterVerification: true,
      },
      rateLimit: { enabled: false },
      logger: { disabled: true },
    }),
  };
});

const EMAIL = "newowner@example.com";
const PASSWORD = "verify-me-2216";

async function register() {
  const { registerUser } = await import("../app/lib/platform-auth.server");
  return registerUser(
    new Request("http://localhost/signup", { method: "POST" }),
    {
      email: EMAIL,
      password: PASSWORD,
      first_name: "New",
      last_name: "Owner",
    },
  );
}

/** The link from the delivered email, exactly as the user would click it. */
function issuedLink(): string {
  const mail = fixtures.send.mock.calls.at(-1)?.[0];
  if (
    !mail ||
    typeof mail !== "object" ||
    !("text" in mail) ||
    typeof mail.text !== "string"
  )
    throw new Error("Verification email missing");
  const link = mail.text.match(/https?:\/\/\S+/)?.[0];
  if (!link) throw new Error("Verification link missing");
  return link;
}

describe("email verification through the actual issued email and installed Better Auth (#2216)", () => {
  beforeEach(() => {
    for (const rows of Object.values(fixtures.database)) rows.splice(0);
    fixtures.send.mockClear();
    resetRateLimitsForTests();
    // registerUser refuses when signup is closed, and SIGNUP_OPEN ships as a
    // deliberate gate (app/lib/env.server.ts), so the journey must open it.
    process.env.SIGNUP_OPEN = "true";
  });

  test("registration withholds the session until the emailed link is opened", async () => {
    const result = await register();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("registration failed");

    // No session token: this is the branch that used to be unreachable, and the
    // reason both signup surfaces must show a pending state.
    expect("token" in result.data).toBe(false);
    expect(result.data).toMatchObject({
      message: expect.stringMatching(/verification/i),
    });
    expect(fixtures.send).toHaveBeenCalledTimes(1);

    const link = issuedLink();
    const url = new URL(link);
    expect(url.pathname).toBe("/auth/confirm");
    expect(url.searchParams.get("type")).toBe("email");
    expect(url.searchParams.get("token_hash")).toBeTruthy();
    expect(fixtures.database.user[0]?.emailVerified).toBe(false);

    // Sign-in is refused with a message that names verification, and Better
    // Auth re-sends the link on that path (emailVerification.sendOnSignIn).
    const { loginWithPassword } =
      await import("../app/lib/platform-auth.server");
    const denied = await loginWithPassword(
      new Request("http://localhost/signin", { method: "POST" }),
      EMAIL,
      PASSWORD,
    );
    expect(denied).toMatchObject({ ok: false });
    if (!denied.ok) expect(denied.error).toMatch(/verification/i);
    expect(fixtures.send).toHaveBeenCalledTimes(2);

    // Opening the link verifies the address, signs the user in, and lands them
    // inside the app rather than back at sign-in.
    const { loader } = await import("../app/routes/auth/confirm.loader.server");
    const confirmed = await asRouteResponse(
      loader(routeArgs(new Request(link))),
    );
    expect(confirmed.status).toBe(302);
    expect(confirmed.headers.get("Location")).toBe("/workspaces");
    expect(fixtures.database.user[0]?.emailVerified).toBe(true);
    expect(fixtures.database.session.length).toBeGreaterThan(0);

    // And the password works from then on.
    const { auth } = await import("@/server/auth-instance");
    await expect(
      auth.api.signInEmail({ body: { email: EMAIL, password: PASSWORD } }),
    ).resolves.toMatchObject({ user: { email: EMAIL } });
  });

  test("the verify-email API route consumes an issued token instead of dead-ending", async () => {
    await register();
    const token = new URL(issuedLink()).searchParams.get("token_hash");

    const { action } =
      await import("../app/routes/api+/auth/verify-email.action.server");
    const response = await asRouteResponse(
      action(
        routeArgs(
          new Request("http://localhost/api/auth/verify-email", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token_hash: token, type: "email" }),
          }),
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      user: { email: EMAIL },
    });
    expect(fixtures.database.user[0]?.emailVerified).toBe(true);
  });

  test("a duplicate address gets the account-exists email, not a verification link", async () => {
    // requireEmailVerification makes Better Auth answer a duplicate sign-up with
    // a synthetic user and no error, so the page cannot be used to test whether
    // an address is registered. That path sends no mail of its own, which is why
    // onExistingUserSignUp has to: otherwise the pending state promises an email
    // nobody sent — the half-wired promise this change exists to end (#2216).
    await register();
    fixtures.send.mockClear();

    const again = await register();
    expect(again.ok).toBe(true);
    if (!again.ok) throw new Error("registration failed");
    // Same response shape as a fresh sign-up: nothing here reveals the address.
    expect("token" in again.data).toBe(false);

    expect(fixtures.send).toHaveBeenCalledTimes(1);
    const mail = fixtures.send.mock.calls[0]?.[0] as {
      subject: string;
      text: string;
    };
    expect(mail.subject).toMatch(/already have a CallCaster account/i);
    expect(mail.text).toContain("http://localhost/signin");
    expect(mail.text).not.toContain("token_hash");
    // The second attempt created nothing.
    expect(fixtures.database.user).toHaveLength(1);
  });
});
