import { jsonError } from "./platform-api.server";
import { checkRateLimitPostgres } from "@/lib/platform-rate-limit-db.server";
import {
  checkRateLimitInMemory,
  type RateLimitBucketState,
  type RateLimitConfig,
  type RateLimitResult,
} from "@/lib/platform-rate-limit-window";

export type { RateLimitConfig, RateLimitResult };

let testMemoryBuckets: Map<string, RateLimitBucketState> | null = null;
let vitestMemoryBuckets: Map<string, RateLimitBucketState> | null = null;

function memoryBuckets(): Map<string, RateLimitBucketState> {
  if (testMemoryBuckets) {
    return testMemoryBuckets;
  }
  if (process.env.VITEST === "true") {
    if (!vitestMemoryBuckets) {
      vitestMemoryBuckets = new Map();
    }
    return vitestMemoryBuckets;
  }
  throw new Error("memoryBuckets called without an active in-memory backend");
}

function usesMemoryBackend(): boolean {
  return testMemoryBuckets !== null || process.env.VITEST === "true";
}

export async function checkRateLimit(config: RateLimitConfig): Promise<RateLimitResult> {
  if (usesMemoryBackend()) {
    return checkRateLimitInMemory(config, memoryBuckets());
  }
  return checkRateLimitPostgres(config);
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
  if (process.env.VITEST === "true") {
    vitestMemoryBuckets?.clear();
    return;
  }
  if (!testMemoryBuckets) {
    testMemoryBuckets = new Map();
  } else {
    testMemoryBuckets.clear();
  }
}
