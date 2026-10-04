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

// Commit small batches so the pool's statement timeout cannot undo the whole
// backlog. Keep checking until empty; a batch can shrink when a writer resets
// a selected bucket while DELETE waits for its row lock.
export async function pruneExpiredRateLimitBuckets(): Promise<number> {
  let total = 0;
  for (;;) {
    const [row] = await db.execute<{ pruned: number; candidates: number }>(sql`
      WITH candidates AS (
        SELECT key FROM rate_limit_bucket
        WHERE reset_at < now() - interval '24 hours'
        ORDER BY reset_at
        LIMIT 1000
      ), deleted AS (
        DELETE FROM rate_limit_bucket
        WHERE key IN (SELECT key FROM candidates)
          AND reset_at < now() - interval '24 hours'
        RETURNING 1
      )
      SELECT count(*)::integer AS pruned,
        (SELECT count(*)::integer FROM candidates) AS candidates
      FROM deleted
    `);
    if (
      !row || !Number.isInteger(row.pruned) || row.pruned < 0 ||
      !Number.isInteger(row.candidates) || row.candidates < row.pruned
    ) {
      throw new Error("Rate-limit cleanup returned an invalid count");
    }
    total += row.pruned;
    if (row.candidates === 0) return total;
  }
}
