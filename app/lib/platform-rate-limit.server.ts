import { jsonError } from "./platform-api.server";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();

export type RateLimitConfig = {
  key: string;
  limit: number;
  windowMs: number;
};

export type RateLimitResult =
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; retryAfterSeconds: number; resetAt: number };

export function checkRateLimit(config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(config.key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + config.windowMs;
    buckets.set(config.key, { count: 1, resetAt });
    return { ok: true, remaining: config.limit - 1, resetAt };
  }

  if (existing.count >= config.limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      resetAt: existing.resetAt,
    };
  }

  existing.count += 1;
  buckets.set(config.key, existing);
  return {
    ok: true,
    remaining: config.limit - existing.count,
    resetAt: existing.resetAt,
  };
}

export function rateLimitResponse(retryAfterSeconds: number): Response {
  return jsonError("Too many requests", 429, "rate_limited", {
    "Retry-After": String(retryAfterSeconds),
  });
}

export function clientRateLimitKey(request: Request, scope: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
  return `${scope}:${ip}`;
}

/** Test helper — clears in-memory buckets between tests. */
export function resetRateLimitsForTests(): void {
  buckets.clear();
}
