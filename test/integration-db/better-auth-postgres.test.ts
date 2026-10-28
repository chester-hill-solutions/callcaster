import { createHmac, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

const mail = vi.hoisted(() => ({
  verification: [] as string[],
  reset: [] as string[],
}));
vi.mock("@/lib/send-verification-email.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/send-verification-email.server")
  >()),
  sendVerificationEmail: async ({ url }: { url: string }) => {
    mail.verification.push(url);
  },
}));
vi.mock("@/lib/send-reset-password-email.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/send-reset-password-email.server")
  >()),
  sendResetPasswordEmail: async ({ url }: { url: string }) => {
    mail.reset.push(url);
  },
}));

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const BASE = "http://localhost:8123";
const PASSWORD = "postgres-auth-fixture-3071";

function cookies(response: Response) {
  return new Headers({
    cookie: response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; "),
  });
}

function totp(uri: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const encoded = new URL(uri).searchParams.get("secret");
  if (!encoded) throw new Error("TOTP enrollment did not return a secret");
  const bits = [...encoded]
    .map((value) => alphabet.indexOf(value).toString(2).padStart(5, "0"))
    .join("");
  const key = Buffer.from(
    bits.match(/.{8}/g)?.map((value) => parseInt(value, 2)) ?? [],
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000)
    .toString()
    .padStart(6, "0");
}

suite("installed Better Auth with the app PostgreSQL adapter (#3071)", () => {
  let sql: postgres.Sql;
  let auth: typeof import("../../app/server/auth-instance").auth;
  const users: string[] = [];
  const emails: string[] = [];

  beforeAll(async () => {
    if (!databaseUrl)
      throw new Error("Auth adapter tests need an owned PostgreSQL fixture");
    vi.stubEnv("DATABASE_URL", databaseUrl);
    vi.stubEnv("DATABASE_DIRECT_URL", databaseUrl);
    vi.stubEnv("BETTER_AUTH_URL", `${BASE}/api/auth`);
    vi.stubEnv(
      "BETTER_AUTH_SECRET",
      "postgres-auth-fixture-secret-with-more-than-32-characters",
    );
    vi.stubEnv("TWO_FACTOR_ENABLED", "1");
    sql = postgres(databaseUrl, { max: 1 });
    ({ auth } = await import("../../app/server/auth-instance"));
  });

  afterAll(async () => {
    if (!sql) return;
    for (const id of users) {
      await sql`delete from auth_verification where value = ${id} or value like ${`%${id}%`}`;
      await sql`delete from auth_user where id = ${id}`;
      await sql`delete from public.user where id = ${id}::uuid`;
    }
    for (const email of emails) {
      await sql`delete from auth_verification where identifier = ${email}`;
    }
    await sql.end({ timeout: 5 });
    vi.unstubAllEnvs();
  });

  async function registered() {
    const email = `auth-3071-${randomUUID()}@example.test`;
    emails.push(email);
    const result = await auth.api.signUpEmail({
      body: { name: "Auth fixture", email, password: PASSWORD },
    });
    users.push(result.user.id);
    expect(result.token).toBeNull();
    const verification = mail.verification.at(-1);
    if (!verification) throw new Error("No verification link was delivered");
    const verified = await auth.handler(new Request(verification));
    expect(
      (await auth.api.getSession({ headers: cookies(verified) }))?.user.id,
    ).toBe(result.user.id);
    return { email, id: result.user.id };
  }

  test("verification, password recovery, and session revocation use the real schema", async () => {
    const user = await registered();
    const signedIn = await auth.api.signInEmail({
      body: { email: user.email, password: PASSWORD },
      asResponse: true,
    });
    const headers = cookies(signedIn);
    const [profile] =
      await sql`select id from public.user where id = ${user.id}::uuid`;
    expect(profile.id).toBe(user.id);
    expect((await auth.api.getSession({ headers }))?.user.id).toBe(user.id);

    await auth.api.requestPasswordReset({
      body: { email: user.email, redirectTo: `${BASE}/reset` },
    });
    const reset = mail.reset.at(-1);
    if (!reset) throw new Error("No recovery link was delivered");
    const token = new URL(reset).pathname.split("/").at(-1);
    const newPassword = "recovered-postgres-fixture-3071";
    await auth.api.resetPassword({ body: { token, newPassword } });
    expect(await auth.api.getSession({ headers })).toBeNull();
    await expect(
      auth.api.signInEmail({ body: { email: user.email, password: PASSWORD } }),
    ).rejects.toThrow();
    expect(
      (
        await auth.api.signInEmail({
          body: { email: user.email, password: newPassword },
        })
      ).user.id,
    ).toBe(user.id);
    await expect(
      auth.api.resetPassword({ body: { token, newPassword: PASSWORD } }),
    ).rejects.toThrow();
  });

  test("two-factor enrollment and the next sign-in require a second factor", async () => {
    const user = await registered();
    const signedIn = await auth.api.signInEmail({
      body: { email: user.email, password: PASSWORD },
      asResponse: true,
    });
    const headers = cookies(signedIn);
    const enrollment = await auth.api.enableTwoFactor({
      headers,
      body: { password: PASSWORD },
    });
    await auth.api.verifyTOTP({
      headers,
      body: { code: totp(enrollment.totpURI) },
    });
    const challenged = await auth.api.signInEmail({
      body: { email: user.email, password: PASSWORD },
      asResponse: true,
    });
    expect(await challenged.clone().json()).toMatchObject({
      twoFactorRedirect: true,
    });
    const challengeHeaders = cookies(challenged);
    expect(await auth.api.getSession({ headers: challengeHeaders })).toBeNull();
    const completed = await auth.api.verifyBackupCode({
      headers: challengeHeaders,
      body: { code: enrollment.backupCodes[0] },
      asResponse: true,
    });
    expect(
      (await auth.api.getSession({ headers: cookies(completed) }))?.user.id,
    ).toBe(user.id);
  });
});
