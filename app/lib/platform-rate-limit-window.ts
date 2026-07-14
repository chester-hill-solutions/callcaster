export type RateLimitConfig = {
  key: string;
  limit: number;
  windowMs: number;
};

export type RateLimitResult =
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; retryAfterSeconds: number; resetAt: number };

export type RateLimitBucketState = {
  count: number;
  resetAt: number;
};

export function nextRateLimitBucketState(
  existing: RateLimitBucketState | undefined,
  limit: number,
  windowMs: number,
  now: number,
): { state: RateLimitBucketState; accepted: boolean } {
  if (!existing || existing.resetAt <= now) {
    return {
      state: { count: 1, resetAt: now + windowMs },
      accepted: true,
    };
  }

  if (existing.count >= limit) {
    return { state: existing, accepted: false };
  }

  return {
    state: { count: existing.count + 1, resetAt: existing.resetAt },
    accepted: true,
  };
}

export function rateLimitResultFromBucket(
  state: RateLimitBucketState,
  limit: number,
  now: number,
  accepted: boolean,
): RateLimitResult {
  if (!accepted) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((state.resetAt - now) / 1000)),
      resetAt: state.resetAt,
    };
  }

  return {
    ok: true,
    remaining: Math.max(0, limit - state.count),
    resetAt: state.resetAt,
  };
}

export function checkRateLimitInMemory(
  config: RateLimitConfig,
  buckets: Map<string, RateLimitBucketState>,
  now = Date.now(),
): RateLimitResult {
  const existing = buckets.get(config.key);
  const { state, accepted } = nextRateLimitBucketState(
    existing,
    config.limit,
    config.windowMs,
    now,
  );
  buckets.set(config.key, state);
  return rateLimitResultFromBucket(state, config.limit, now, accepted);
}
