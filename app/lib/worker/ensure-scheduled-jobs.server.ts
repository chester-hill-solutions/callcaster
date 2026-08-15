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
import { requeueStoredJob } from "@/lib/worker/job-params.server";
import {
  SELF_SCHEDULING_JOB_TYPES,
  SELF_SCHEDULING_SEED_PARAMS,
} from "@/lib/worker/handlers.server";

// Re-exported for backwards compatibility: both are now DERIVED from the job
// registry (see handlers.server.ts / job-registry.server.ts, #1239 A1)
// instead of being hand-maintained here.
export { SELF_SCHEDULING_JOB_TYPES };

export type SelfSchedulingJobType = (typeof SELF_SCHEDULING_JOB_TYPES)[number];

export async function ensureSelfSchedulingJobsSeeded(): Promise<{
  seeded: SelfSchedulingJobType[];
}> {
  const seeded: SelfSchedulingJobType[] = [];
  for (const type of SELF_SCHEDULING_JOB_TYPES) {
    try {
      const params = SELF_SCHEDULING_SEED_PARAMS[type] ?? {};
      // `type` here is a runtime-derived `string` (iterating every
      // self-scheduling type, not one compile-time-known literal), so this
      // goes through the `requeueStoredJob` escape hatch rather than the
      // per-literal-typed `enqueueRegisteredJob` — see that function's doc
      // comment in job-registry.server.ts.
      const outcome = await requeueStoredJob(type, params, { dedupe: { kind: "live" } });
      if (!outcome.ok) {
        logger.error("worker.schedule_seed.failed", { type, error: outcome.error });
        continue;
      }
      if (outcome.result.enqueued) {
        seeded.push(type);
        logger.info("worker.schedule_seed.inserted", {
          type,
          jobId: outcome.result.jobId,
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
