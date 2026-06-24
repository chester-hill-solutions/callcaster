import {
  checkRateLimit,
  clientRateLimitKey,
  rateLimitResponse,
} from "@/lib/platform-rate-limit.server";

export type AuthRateLimitScope =
  | "auth:register"
  | "auth:token"
  | "auth:refresh"
  | "auth:forgot-password";

const LIMITS: Record<
  AuthRateLimitScope,
  { limit: number; windowMs: number }
> = {
  "auth:register": { limit: 10, windowMs: 60_000 },
  "auth:token": { limit: 30, windowMs: 60_000 },
  "auth:refresh": { limit: 60, windowMs: 60_000 },
  "auth:forgot-password": { limit: 10, windowMs: 60_000 },
};

export function enforceAuthRateLimit(
  request: Request,
  scope: AuthRateLimitScope,
): Response | null {
  const config = LIMITS[scope];
  const result = checkRateLimit({
    key: clientRateLimitKey(request, scope),
    limit: config.limit,
    windowMs: config.windowMs,
  });
  if (!result.ok) {
    return rateLimitResponse(result.retryAfterSeconds);
  }
  return null;
}
