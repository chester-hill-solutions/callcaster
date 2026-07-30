import { sql } from "drizzle-orm";
import { db } from "@/server/db";

/** Completed jobs older than this are deleted. */
export const COMPLETED_JOB_RETENTION_DAYS = 7;

/**
 * Rows per DELETE. Bounded because the shared pool now enforces a 30s
 * statement_timeout: one unbounded DELETE over a table that has never been
 * pruned would be cancelled partway and make no progress on any run.
 */
export const JOB_PRUNE_BATCH_SIZE = 1_000;

/** Stops a pathological run from monopolising the worker for a whole tick. */
const MAX_BATCHES_PER_RUN = 20;

/**
 * Delete completed job rows past the retention window.
 *
 * Nothing ever pruned this table. Two things accumulate in it: the
 * self-rescheduling cron chains, which append a row every few minutes forever
 * (`twilio_open_sync` alone reaches thousands within weeks), and
 * `audience_upload`, whose `params` carries the entire uploaded CSV as base64 —
 * hundreds of KB per row, retained indefinitely for a payload that is dead the
 * moment the job completes.
 *
 * Deliberately scoped to `completed` only:
 * - `dead_letter` rows are the diagnostic surface on /admin/dead-letters, and
 *   their `params` is precisely what `requeueDeadLetteredJob` re-runs. Deleting
 *   one, or clearing its payload, would silently destroy the ability to recover
 *   a lost debit — the opposite of what the requeue path exists for.
 * - `queued` and `running` are live work.
 *
 * Returns the number of rows deleted.
 */
export async function pruneCompletedJobs(
  retentionDays: number = COMPLETED_JOB_RETENTION_DAYS,
): Promise<number> {
  let deleted = 0;

  for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch += 1) {
    const rows = await db.execute(sql`
      DELETE FROM job
      WHERE id IN (
        SELECT id FROM job
        WHERE status = 'completed'
          AND completed_at IS NOT NULL
          AND completed_at < now() - make_interval(days => ${retentionDays})
        ORDER BY completed_at
        LIMIT ${JOB_PRUNE_BATCH_SIZE}
      )
      RETURNING id
    `);

    const count = Array.isArray(rows) ? rows.length : 0;
    deleted += count;
    if (count < JOB_PRUNE_BATCH_SIZE) break;
  }

  return deleted;
}
