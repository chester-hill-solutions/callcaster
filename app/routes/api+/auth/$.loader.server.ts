import { isSignupOpen } from "@/lib/env.server";
import { jsonError } from "@/lib/platform-api.server";
import { defineAction, defineLoader } from "@/lib/handler.server";
import { enforceAuthRateLimit } from "@/lib/platform-auth-rate-limit.server";
import { auth } from "@/server/auth-instance";

function isBetterAuthSignUpPath(url: URL): boolean {
  return url.pathname.includes("/sign-up");
}

/**
 * Better Auth's own two-factor enable/disable endpoints change 2FA state
 * without the application's prior-state and protected-user rules, so they must
 * not be reachable directly: enableTwoFactor replaces the stored secret and
 * the backup codes, and disableTwoFactor removes the factor. Both are governed
 * by the application's own /account/security action instead.
 *
 * The TOTP challenge path stays open: the sign-in flow posts to it.
 */
function isAppManagedTwoFactorPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/auth/two-factor/enable") ||
    pathname.startsWith("/api/auth/two-factor/disable") ||
    // Regenerating the backup codes replaces the set the account holds, which is
    // an enrolment-state change like the two above; the app never calls it.
    pathname.startsWith("/api/auth/two-factor/generate-backup-codes")
  );
}

/** Credential/TOTP guessing surfaces get the strict bucket; other POSTs the loose one. */
function rateLimitScopeForAuthPath(
  url: URL,
): "auth:sign-in" | "auth:catch-all" {
  return url.pathname.includes("/sign-in") ||
    url.pathname.includes("/two-factor")
    ? "auth:sign-in"
    : "auth:catch-all";
}

async function handleAuthRequest(request: Request, url: URL) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    const limited = await enforceAuthRateLimit(
      request,
      rateLimitScopeForAuthPath(url),
    );
    if (limited) return limited;
  }
  if (!isSignupOpen() && isBetterAuthSignUpPath(url)) {
    return jsonError("Registration is closed.", 403);
  }
  if (isAppManagedTwoFactorPath(url.pathname)) {
    return jsonError(
      "Change two-factor authentication from the account security page.",
      403,
    );
  }
  return auth.handler(request);
}

export const loader = defineLoader({
  sideEffects: ["db-write", "external"],
  handler: ({ request, url }) => handleAuthRequest(request, url),
});

export const action = defineAction({
  sideEffects: ["db-write", "external"],
  handler: ({ request, url }) => handleAuthRequest(request, url),
});
