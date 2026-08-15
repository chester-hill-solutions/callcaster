import { logger } from "@/lib/logger.server";
import { enqueueRegisteredJob, type JobParamsMap } from "@/lib/worker/job-params.server";

/**
 * Run a self-scheduling job's work, guaranteeing the next occurrence is
 * enqueued even when the work throws.
 *
 * These chains are the only scheduler: there is no pg_cron and no external
 * trigger. Every handler used to reschedule *after* its work, so a throwing
 * tick never scheduled a successor — three failed attempts dead-lettered the
 * job and `billing_reconcile` / `number_rental_billing` then never ran again
 * until someone redeployed the worker. Silently, and on the money paths.
 *
 * Rescheduling in `finally` is safe against duplicates: `rescheduleJob` dedupes
 * on a live row excluding this job, so a retry of the same job finds the
 * successor already queued and no-ops.
 */
export async function withReschedule<T, Type extends keyof JobParamsMap & string>(
  args: {
    type: Type;
    delayMs: number;
    params: JobParamsMap[Type];
    completedJobId: number;
    /** Skip for per-workspace child jobs; only the root job carries the chain. */
    enabled?: boolean;
  },
  work: () => Promise<T>,
): Promise<T> {
  try {
    return await work();
  } finally {
    if (args.enabled !== false) {
      await rescheduleJob(
        args.type,
        args.delayMs,
        args.params,
        args.completedJobId,
      );
    }
  }
}

/**
 * Enqueue the next run of a self-scheduling cron/coordinator job. Typed
 * (#1239 A3) against the same registered-job param schemas every other
 * enqueue call site validates against — `type` must be a registered job
 * type, and `params` must match its zod-inferred shape at compile time.
 */
export async function rescheduleJob<Type extends keyof JobParamsMap & string>(
  type: Type,
  delayMs: number,
  params: JobParamsMap[Type],
  completedJobId: number,
): Promise<void> {
  const nextRunAt = new Date(Date.now() + delayMs).toISOString();
  try {
    await enqueueRegisteredJob({
      type,
      params,
      runAt: nextRunAt,
      dedupe: {
        kind: "live",
        excludeJobId: completedJobId,
      },
    });
  } catch (error) {
    logger.error(`worker.handler.${type}.reschedule_failed`, {
      jobId: completedJobId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// requireStringParam is the last hand-rolled params narrowing left in this
// file: every other job type's params narrowing now lives in a zod schema
// next to its `defineJob` registration in handlers.server.ts (#1239 A2). This
// one is still used by elevenlabs-batch-transcribe.server.ts's handler, which
// wasn't part of that migration.
export function requireStringParam(
  params: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = params[key];
  return typeof value === "string" ? value : undefined;
}
