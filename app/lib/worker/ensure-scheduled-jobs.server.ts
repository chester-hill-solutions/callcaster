/**
 * Boot-time seeding for self-re-enqueuing job types.
 *
 * After WS-A cron cutover, the Bun worker owns schedules formerly driven by
 * pg_cron HTTP posts to `/api/jobs/*`. Self-scheduling types insert their next
 * occurrence on complete (via `retry_at`); this seed starts the chain if no
 * live (queued/running) row exists.
 *
 * The unified enqueue path serializes live-dedupe by type/workspace with a
 * transaction-scoped advisory lock, so concurrent boots cannot each seed a
 * self-perpetuating chain.
 */

import { logger } from "@/lib/logger.server";
import { enqueueJob } from "@/lib/worker/enqueue-job.server";

/** Job types that re-enqueue themselves and therefore need a first row. */
export const SELF_SCHEDULING_JOB_TYPES = [
  "low_credit_notify",
  "twilio_webhook_audit",
  "twilio_open_sync",
  "billing_reconcile",
  "number_rental_billing",
  "campaign_schedule_sync",
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
      const result = await enqueueJob({
        type,
        params,
        dedupe: { kind: "live" },
      });
      if (result.enqueued) {
        seeded.push(type);
        logger.info("worker.schedule_seed.inserted", {
          type,
          jobId: result.jobId,
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
