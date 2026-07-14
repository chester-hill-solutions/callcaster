import { jsonError } from "./platform-api.server";
import { checkRateLimitPostgres } from "@/lib/platform-rate-limit-db.server";
import {
  checkRateLimitInMemory,
  type RateLimitBucketState,
  type RateLimitConfig,
  type RateLimitResult,
} from "@/lib/platform-rate-limit-window";

export type { RateLimitConfig, RateLimitResult };

/** Single in-memory Map used when `VITEST=true` or after `resetRateLimitsForTests`. */
let memoryBackend: Map<string, RateLimitBucketState> | null = null;

function getMemoryBackend(): Map<string, RateLimitBucketState> {
  if (!memoryBackend) {
    memoryBackend = new Map();
  }
  return memoryBackend;
}

function usesMemoryBackend(): boolean {
  return memoryBackend !== null || process.env.VITEST === "true";
}

export async function checkRateLimit(config: RateLimitConfig): Promise<RateLimitResult> {
  if (usesMemoryBackend()) {
    return checkRateLimitInMemory(config, getMemoryBackend());
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
  getMemoryBackend().clear();
}
