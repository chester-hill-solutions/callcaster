/**
 * Boot-time seeding for self-re-enqueuing job types.
 *
 * After WS-A cron cutover, the Bun worker owns schedules formerly driven by
 * pg_cron HTTP posts to `/api/jobs/*`. Self-scheduling types insert their next
 * occurrence on complete (via `retry_at`); this seed starts the chain if no
 * live (queued/running) row exists.
 *
 * The INSERT … WHERE NOT EXISTS keeps check-and-insert atomic so concurrent
 * boots cannot each seed a row. A duplicated chain re-enqueues itself forever,
 * so this guard stays until durable schedule definitions land with CHS
 * jobqueue adoption (BILL-01).
 */

import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { logger } from "@/lib/logger.server";

/** Job types that re-enqueue themselves and therefore need a first row. */
export const SELF_SCHEDULING_JOB_TYPES = [
  "low_credit_notify",
  "twilio_webhook_audit",
  "twilio_open_sync",
  "billing_reconcile",
  "number_rental_billing",
] as const;

export type SelfSchedulingJobType = (typeof SELF_SCHEDULING_JOB_TYPES)[number];

const SELF_SCHEDULING_SEED_PARAMS: Partial<
  Record<SelfSchedulingJobType, Record<string, unknown>>
> = {
  twilio_open_sync: {
    callLimit: 50,
    messageLimit: 50,
    maxAgeMinutes: 120,
  },
};

export async function ensureSelfSchedulingJobsSeeded(): Promise<{
  seeded: SelfSchedulingJobType[];
}> {
  const seeded: SelfSchedulingJobType[] = [];
  for (const type of SELF_SCHEDULING_JOB_TYPES) {
    try {
      const params = SELF_SCHEDULING_SEED_PARAMS[type] ?? {};
      const paramsJson = JSON.stringify(params);
      const rows = (await db.execute(sql`
        INSERT INTO job (type, status, params)
        SELECT ${type}, 'queued', ${paramsJson}::jsonb
        WHERE NOT EXISTS (
          SELECT 1 FROM job
          WHERE type = ${type}
            AND status IN ('queued', 'running')
        )
        RETURNING id
      `)) as Array<{ id: number }>;
      const inserted = rows[0];
      if (inserted) {
        seeded.push(type);
        logger.info("worker.schedule_seed.inserted", {
          type,
          jobId: inserted.id,
        });
      }
    } catch (error) {
      // A failed seed must not stop the worker from booting — the poll loop
      // can still drain whatever is already queued, and the next boot retries.
      logger.error("worker.schedule_seed.failed", {
        type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { seeded };
}
