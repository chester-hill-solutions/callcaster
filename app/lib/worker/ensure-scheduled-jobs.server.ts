/**
 * Boot-time seeding for self-re-enqueuing job types.
 *
 * `low_credit_notify` and `twilio_webhook_audit` keep themselves scheduled by
 * inserting their own next occurrence when they complete — but that chain has
 * to start somewhere. Previously ops had to insert the first row by hand
 * (docs/twilio-parent-ops-runbook.md §6). The worker now seeds any missing
 * chain at boot: if a job type has no live (queued/running) row, one queued
 * row is inserted.
 *
 * The INSERT … WHERE NOT EXISTS keeps the check-and-insert in one statement so
 * concurrent booting workers cannot each seed a row in the common case. A
 * duplicated chain matters here because every extra row re-enqueues itself
 * forever; this is the interim guard until durable schedule definitions land
 * with the CHS jobqueue adoption (BILL-01).
 */

import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { logger } from "@/lib/logger.server";

/** Job types that re-enqueue themselves and therefore need a first row. */
export const SELF_SCHEDULING_JOB_TYPES = [
  "low_credit_notify",
  "twilio_webhook_audit",
] as const;

export type SelfSchedulingJobType = (typeof SELF_SCHEDULING_JOB_TYPES)[number];

export async function ensureSelfSchedulingJobsSeeded(): Promise<{
  seeded: SelfSchedulingJobType[];
}> {
  const seeded: SelfSchedulingJobType[] = [];
  for (const type of SELF_SCHEDULING_JOB_TYPES) {
    try {
      const rows = (await db.execute(sql`
        INSERT INTO job (type, status, params)
        SELECT ${type}, 'queued', '{}'::jsonb
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
