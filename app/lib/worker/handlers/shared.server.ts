import { logger } from "@/lib/logger.server";
import { enqueueJob } from "@/lib/worker/enqueue-job.server";

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
export async function withReschedule<T>(
  args: {
    type: string;
    delayMs: number;
    params?: Record<string, unknown>;
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
        args.params ?? {},
        args.completedJobId,
      );
    }
  }
}

/**
 * Enqueue the next run of a self-scheduling cron/coordinator job.
 */
export async function rescheduleJob(
  type: string,
  delayMs: number,
  params: Record<string, unknown>,
  completedJobId: number,
): Promise<void> {
  const nextRunAt = new Date(Date.now() + delayMs).toISOString();
  try {
    await enqueueJob({
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

export function requireStringParam(
  params: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = params[key];
  return typeof value === "string" ? value : undefined;
}

export function requireNumberParam(
  params: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = params[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  // Tenant-db rows serialize serial/bigint ids as strings, and those ids get
  // enqueued into jsonb job params verbatim. Rejecting "12" here dead-ended
  // every audience upload job with "Missing required parameters" (#1078).
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  return undefined;
}

export function requireRecordParam(
  params: Record<string, unknown>,
  key: string,
): Record<string, string> | undefined {
  const value = params[key];
  if (typeof value === "object" && value !== null) {
    return value as Record<string, string>;
  }
  return undefined;
}
