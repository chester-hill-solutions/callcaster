import {
  checkRateLimit,
  clientRateLimitKey,
  rateLimitResponse,
} from "@/lib/platform-rate-limit.server";
import { jsonError } from "@/lib/platform-api.server";

export type AuthRateLimitScope =
  | "auth:register"
  | "auth:token"
  | "auth:refresh"
  | "auth:forgot-password"
  | "auth:sign-in"
  | "auth:catch-all"
  | "auth:reset-password"
  | "auth:verify-email";

const LIMITS: Record<
  AuthRateLimitScope,
  { limit: number; windowMs: number }
> = {
  "auth:register": { limit: 10, windowMs: 60_000 },
  "auth:token": { limit: 30, windowMs: 60_000 },
  "auth:refresh": { limit: 60, windowMs: 60_000 },
  "auth:forgot-password": { limit: 10, windowMs: 60_000 },
  // Credential + TOTP guesses via the Better Auth handler.
  "auth:sign-in": { limit: 10, windowMs: 60_000 },
  // Remaining Better Auth POSTs (sign-out, session revoke, …).
  "auth:catch-all": { limit: 30, windowMs: 60_000 },
  "auth:reset-password": { limit: 10, windowMs: 60_000 },
  // Unauthenticated OTP verification — 6-digit codes are guessable.
  "auth:verify-email": { limit: 10, windowMs: 60_000 },
};

/**
 * E2E suites sign in dozens of times from one address, which legitimately
 * exhausts the strict credential buckets. Same contract as
 * `isTwoFactorEnforcementDisabled`: honored only outside Railway production,
 * and loudly ignored if it ever leaks into production config.
 */
function isAuthRateLimitDisabled(): boolean {
  const flagSet =
    process.env.E2E_DISABLE_AUTH_RATE_LIMIT === "1" ||
    process.env.DISABLE_AUTH_RATE_LIMIT === "1";
  if (!flagSet) return false;

  if (process.env.RAILWAY_ENVIRONMENT_NAME === "production") {
    console.error(
      "DISABLE_AUTH_RATE_LIMIT is set on Railway production — ignoring; auth rate limiting remains active.",
    );
    return false;
  }
  return true;
}

export async function enforceAuthRateLimit(
  request: Request,
  scope: AuthRateLimitScope,
): Promise<Response | null> {
  if (isAuthRateLimitDisabled()) {
    return null;
  }
  const config = LIMITS[scope];
  const result = await checkRateLimit({
    key: clientRateLimitKey(request, scope),
    limit: config.limit,
    windowMs: config.windowMs,
  });
  if (!result.ok) {
    return rateLimitResponse(result.retryAfterSeconds);
  }
  return null;
}

/**
 * The shared `auth:` gate for POST-only rate-limited auth routes: rejects
 * non-POST with 405, applies the scope's bucket, passes with `undefined`.
 * Compose extra checks after it, e.g.:
 *   auth: async (args) => (await rateLimitedPostAuth("auth:x")(args)) ?? requireJsonAuth(args.request)
 */
export function rateLimitedPostAuth(scope: AuthRateLimitScope) {
  return async ({
    request,
  }: {
    request: Request;
  }): Promise<Response | undefined> => {
    if (request.method !== "POST") {
      return jsonError("Method not allowed", 405);
    }
    return (await enforceAuthRateLimit(request, scope)) ?? undefined;
  };
}
