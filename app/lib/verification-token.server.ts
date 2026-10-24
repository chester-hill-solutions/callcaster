import { mergeBetterAuthSetCookieHeaders } from "@/lib/better-auth-headers.server";
import { logger } from "@/lib/logger.server";
import { auth } from "@/server/auth-instance";

export type VerificationOutcome =
  { ok: true; headers: Headers } | { ok: false };

/**
 * Consume an email-verification token through Better Auth and hand back the
 * session cookies it sets on that same response.
 *
 * Success must not be read from the payload's `user`. Better Auth's
 * verify-email endpoint ends with `{ status: true, user: null }` and only fills
 * `user` on its email-change branches
 * (node_modules/better-auth/dist/api/routes/email-verification.mjs); the
 * account arrives as a session cookie on the same response. All three callers
 * here used to require `payload.user`, so a successful verification was
 * reported as a failure — the confirm route and `/api/auth/callback` sent the
 * user back to /signin, and the JSON route answered 400. The verification
 * links this app now mails would have been dead on arrival (#2216).
 *
 * One implementation for all three, so the next response-shape change only has
 * to be right once.
 */
export async function consumeVerificationToken(
  request: Request,
  token: string,
): Promise<VerificationOutcome> {
  try {
    const result = await auth.api.verifyEmail({
      query: { token },
      headers: request.headers,
      returnHeaders: true,
    });

    const payload = (result?.response ?? result) as
      { status?: boolean } | undefined;
    if (payload?.status !== true) {
      logger.error("verification.token.rejected", {
        reason: "no_success_status",
      });
      return { ok: false };
    }

    return {
      ok: true,
      headers: mergeBetterAuthSetCookieHeaders(result?.headers),
    };
  } catch (error) {
    logger.error("verification.token.rejected", error);
    return { ok: false };
  }
}

/**
 * The `name=value` of the first cookie on a response, as a request `Cookie`
 * header. The JSON verification route needs it because the session Better Auth
 * creates lives on the response headers, not on the request it was called with.
 */
export function cookieHeaderFrom(headers: Headers): string {
  const first = headers.getSetCookie()[0];
  if (!first) return "";
  return first.split(";")[0] ?? "";
}
