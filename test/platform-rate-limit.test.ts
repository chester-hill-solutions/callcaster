import { describe, expect, test } from "vitest";
import {
  checkRateLimitInMemory,
  nextRateLimitBucketState,
  rateLimitResultFromBucket,
  type RateLimitBucketState,
} from "@/lib/platform-rate-limit-window";

describe("platform-rate-limit-window", () => {
  const limit = 3;
  const windowMs = 60_000;
  const windowStart = 1_700_000_000_000;

  test("starts a fresh window when no bucket exists", () => {
    const { state, accepted } = nextRateLimitBucketState(
      undefined,
      limit,
      windowMs,
      windowStart,
    );

    expect(accepted).toBe(true);
    expect(state).toEqual({ count: 1, resetAt: windowStart + windowMs });
  });

  test("resets the window after expiry", () => {
    const expired: RateLimitBucketState = { count: limit, resetAt: windowStart };
    const now = windowStart + 1;

    const { state, accepted } = nextRateLimitBucketState(
      expired,
      limit,
      windowMs,
      now,
    );

    expect(accepted).toBe(true);
    expect(state).toEqual({ count: 1, resetAt: now + windowMs });
  });

  test("rejects when the window is full", () => {
    const full: RateLimitBucketState = {
      count: limit,
      resetAt: windowStart + windowMs,
    };

    const { state, accepted } = nextRateLimitBucketState(
      full,
      limit,
      windowMs,
      windowStart + 1_000,
    );

    expect(accepted).toBe(false);
    expect(state).toEqual(full);
  });

  test("increments within an active window", () => {
    const active: RateLimitBucketState = {
      count: 1,
      resetAt: windowStart + windowMs,
    };

    const { state, accepted } = nextRateLimitBucketState(
      active,
      limit,
      windowMs,
      windowStart + 1_000,
    );

    expect(accepted).toBe(true);
    expect(state).toEqual({ count: 2, resetAt: active.resetAt });
  });

  test("maps accepted requests to remaining quota", () => {
    const state: RateLimitBucketState = { count: 2, resetAt: windowStart + windowMs };
    const result = rateLimitResultFromBucket(state, limit, windowStart, true);

    expect(result).toEqual({
      ok: true,
      remaining: 1,
      resetAt: state.resetAt,
    });
  });

  test("maps rejected requests to retry-after seconds", () => {
    const state: RateLimitBucketState = { count: limit, resetAt: windowStart + 5_500 };
    const result = rateLimitResultFromBucket(state, limit, windowStart, false);

    expect(result).toEqual({
      ok: false,
      retryAfterSeconds: 6,
      resetAt: state.resetAt,
    });
  });

  test("enforces limit across sequential in-memory checks", () => {
    const buckets = new Map<string, RateLimitBucketState>();
    const config = { key: "auth:token:203.0.113.1", limit, windowMs };
    const now = windowStart;

    for (let i = 0; i < limit; i += 1) {
      const result = checkRateLimitInMemory(config, buckets, now + i);
      expect(result.ok).toBe(true);
    }

    const limited = checkRateLimitInMemory(config, buckets, now + limit);
    expect(limited.ok).toBe(false);
    if (!limited.ok) {
      expect(limited.retryAfterSeconds).toBeGreaterThan(0);
    }
  });
});
