import postgres from "postgres";

/**
 * Confirm an address directly in the e2e database.
 *
 * The compose harness builds the app with a placeholder Resend key, so nothing
 * delivers the verification mail and a browser test cannot follow the link. This
 * is the one shortcut the signup journey takes; the verification path itself —
 * mail content, the confirm route, sign-in refusal, resend and the signed-in
 * landing — is covered end to end by `test/email-verification-journey.test.ts`
 * against the real Better Auth and its real callbacks.
 */
export async function confirmEmailAddress(email: string): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required to confirm an e2e signup");
  }

  const sql = postgres(url, { max: 1 });
  try {
    await sql`update auth_user set email_verified = true where email = ${email}`;
  } finally {
    await sql.end();
  }
}
