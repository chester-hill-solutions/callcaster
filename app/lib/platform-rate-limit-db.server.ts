import { sql } from "drizzle-orm";
import type { RateLimitConfig, RateLimitResult } from "@/lib/platform-rate-limit-window";
import { db } from "@/server/db";

type RateLimitRpcRow = {
  ok: boolean;
  remaining: number;
  reset_at_ms: number | string | bigint;
  retry_after_seconds: number;
};

export async function checkRateLimitPostgres(
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const rows = (await db.execute(
    sql`select * from check_rate_limit_bucket(
      ${config.key},
      ${config.limit},
      ${config.windowMs}
    )`,
  )) as RateLimitRpcRow[];

  const row = rows[0];
  if (!row) {
    throw new Error("check_rate_limit_bucket returned no row");
  }

  const resetAt = Number(row.reset_at_ms);
  if (!Number.isFinite(resetAt)) {
    throw new Error("check_rate_limit_bucket returned invalid reset_at_ms");
  }

  if (row.ok) {
    return {
      ok: true,
      remaining: row.remaining,
      resetAt,
    };
  }

  return {
    ok: false,
    retryAfterSeconds: Math.max(1, row.retry_after_seconds),
    resetAt,
  };
}
