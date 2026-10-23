/**
 * Single source for the password rule across the signup form, the reset form,
 * the public API schema, and Better Auth itself.
 *
 * Better Auth's default minimum is 8 (`create-context.mjs`), the signup form
 * already declares `minLength={8}` (`app/routes/signup.tsx:121`), and the public
 * API documents `minLength: 8` (`app/lib/openapi-platform-components.ts:45`).
 * The reset form was the one credential entry point that stated nothing, so a
 * short password there failed with a message about the link (#2075).
 */
export const MIN_PASSWORD_LENGTH = 8;

export const PASSWORD_MIN_LENGTH_MESSAGE = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
