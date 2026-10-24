/**
 * One source for the credential rules this app states to users: the signup form
 * (app/routes/signup.tsx), the reset form (app/routes/reset-password.tsx), the
 * public API schema (app/lib/openapi-platform-components.ts), and the Better Auth
 * config (app/server/auth-instance.ts).
 *
 * Better Auth's defaults are 8 and 128 (create-context.mjs). Declaring the
 * minimum here keeps the two forms and the server from drifting apart — the reset
 * form stated nothing, so a short password there failed with a message about the
 * link (#2075).
 */
export const MIN_PASSWORD_LENGTH = 8;

export const PASSWORD_MIN_LENGTH_MESSAGE = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;

export const PASSWORD_TOO_LONG_MESSAGE = "Password is too long.";

/** Better Auth refused the token itself: expired, unknown, or already used. */
export const INVALID_RESET_LINK_MESSAGE =
  "This reset link is invalid or has expired. Request a new one from the sign-in page.";

/** The reset page was opened with no token at all: there is nothing to submit. */
export const INCOMPLETE_RESET_LINK_MESSAGE =
  "This reset link is incomplete. Request a new link to continue.";

/**
 * The message for a reset link that cannot be used, or null when the form is the
 * right thing to show.
 *
 * A refused token and a missing token are different problems and get different
 * wording. Any other error value is not a reason to hide the form, and a token
 * that is merely present is not a claim that it works — the submit path says so
 * if Better Auth rejects it (#2661).
 */
export function resetLinkProblem(
  token: string | null,
  error: string | null,
): string | null {
  if (error === "INVALID_TOKEN") return INVALID_RESET_LINK_MESSAGE;
  if (!token?.trim()) return INCOMPLETE_RESET_LINK_MESSAGE;
  return null;
}
