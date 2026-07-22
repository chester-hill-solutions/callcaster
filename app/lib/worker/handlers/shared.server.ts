import { logger } from "@/lib/logger.server";
import { enqueueJob } from "@/lib/worker/enqueue-job.server";

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
