import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { logger } from "@/lib/logger.server";
import { runWithRequestContext } from "@/lib/request-context.server";
import { captureException } from "@/lib/sentry.server";

export type ClaimedJobRow = {
  id: number;
  type: string;
  params: unknown;
  workspace_id: string | null;
  user_id: string | null;
  attempt_count: number;
  max_attempts: number;
};

export type JobHandler = (job: ClaimedJobRow) => Promise<unknown>;
export type JobHandlers = Record<string, JobHandler>;

export type WorkerOptions = {
  pollIntervalMs?: number;
  heartbeatIntervalMs?: number;
  claimTtlMinutes?: number;
};

function getJobRequestId(job: ClaimedJobRow): string {
  if (
    job.params &&
    typeof job.params === "object" &&
    "requestId" in job.params &&
    typeof job.params.requestId === "string"
  ) {
    return job.params.requestId;
  }
  return `job-${job.id}`;
}

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_CLAIM_TTL_MINUTES = 5;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (signal?.aborted) {
      clearTimeout(timer);
      resolve();
      return;
    }
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export function getWorkerId(): string {
  return `bun-worker-${process.pid}-${Date.now()}`;
}

export async function resetStaleClaims(): Promise<void> {
  // Reclaims are re-queued WITHOUT bumping attempt_count here: claimNextJob
  // increments attempt_count when it re-claims the row, so a crash-recovery
  // cycle costs exactly one attempt instead of two (reset + reclaim).
  await db.execute(sql`
    UPDATE job
    SET status = 'queued',
        claimed_until = null,
        claimed_by = null,
        updated_at = now()
    WHERE status = 'running'
      AND claimed_until < now()
  `);
  logger.info("worker.stale_claims_reset");
}

export async function claimNextJob(
  workerId: string,
  claimTtlMinutes: number = DEFAULT_CLAIM_TTL_MINUTES,
): Promise<ClaimedJobRow | null> {
  return db.transaction(async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT id, type, params, workspace_id, user_id, attempt_count, max_attempts
      FROM job
      WHERE status = 'queued'
        AND (retry_at IS NULL OR retry_at <= now())
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `)) as ClaimedJobRow[];

    const job = rows[0];
    if (!job) return null;

    await tx.execute(sql`
      UPDATE job
      SET status = 'running',
          claimed_until = now() + interval '1 minute' * ${claimTtlMinutes},
          claimed_by = ${workerId},
          started_at = now(),
          attempt_count = attempt_count + 1,
          updated_at = now()
      WHERE id = ${job.id}
    `);

    return { ...job, attempt_count: job.attempt_count + 1 };
  });
}

export async function completeJob(
  jobId: number,
  result: unknown,
): Promise<void> {
  await db.execute(sql`
    UPDATE job
    SET status = 'completed',
        result = ${JSON.stringify(result)},
        completed_at = now(),
        updated_at = now()
    WHERE id = ${jobId}
  `);
}

export async function failJob(
  jobId: number,
  attemptCount: number,
  maxAttempts: number,
  error: string,
  jobType?: string,
): Promise<void> {
  if (attemptCount < maxAttempts) {
    await db.execute(sql`
      UPDATE job
      SET status = 'queued',
          retry_at = now() + interval '1 minute' * ${attemptCount},
          error_message = ${error},
          updated_at = now()
      WHERE id = ${jobId}
    `);
  } else {
    await db.execute(sql`
      UPDATE job
      SET status = 'dead_letter',
          failed_at = now(),
          dead_letter_reason = ${error},
          error_message = ${error},
          updated_at = now()
      WHERE id = ${jobId}
    `);
    // Surface terminal rows immediately for ops alerting and log search.
    logger.error("worker.job.dead_letter", {
      jobId,
      type: jobType ?? "unknown",
      attemptCount,
      maxAttempts,
      reason: error,
    });
  }
}

export async function runWorkerPollLoop(
  signal: AbortSignal,
  handlers: JobHandlers,
  options: WorkerOptions = {},
): Promise<void> {
  const workerId = getWorkerId();
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const heartbeatIntervalMs =
    options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  const claimTtlMinutes = options.claimTtlMinutes ?? DEFAULT_CLAIM_TTL_MINUTES;

  await resetStaleClaims();

  while (!signal.aborted) {
    try {
      // Cheap (single indexed UPDATE) — run every iteration, not just at
      // boot, so claims stranded by a mid-poll crash/redeploy are recovered
      // without waiting for the next process restart.
      await resetStaleClaims();

      const job = await claimNextJob(workerId, claimTtlMinutes);
      if (!job) {
        await sleep(pollIntervalMs, signal);
        continue;
      }

      await runWithRequestContext(
        { requestId: getJobRequestId(job) },
        async () => {
          logger.info("worker.job.claimed", {
            jobId: job.id,
            type: job.type,
            workspaceId: job.workspace_id,
          });

          const heartbeat = setInterval(async () => {
            try {
              await db.execute(sql`
                UPDATE job
                SET claimed_until = now() + interval '1 minute' * ${claimTtlMinutes},
                    updated_at = now()
                WHERE id = ${job.id}
              `);
            } catch (err) {
              logger.error("worker.heartbeat_failed", {
                jobId: job.id,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }, heartbeatIntervalMs);

          try {
            const handler = handlers[job.type];
            if (!handler) {
              throw new Error(`No handler registered for job type: ${job.type}`);
            }
            const result = await handler(job);
            await completeJob(job.id, result);
            logger.info("worker.job.completed", { jobId: job.id });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            captureException(error, {
              source: "worker.job",
              jobId: job.id,
              jobType: job.type,
            });
            logger.error("worker.job.failed", { jobId: job.id, error: message });
            await failJob(job.id, job.attempt_count, job.max_attempts, message, job.type);
          } finally {
            clearInterval(heartbeat);
          }
        },
      );

      if (signal.aborted) break;
      // Drain the queue back-to-back: only the empty-queue branch above sleeps.
      // Sleeping here throttled bursts to one job per poll interval and made
      // even a 1-row audience upload wait out the interval (#1078).
    } catch (error) {
      captureException(error, { source: "worker.poll" });
      logger.error(
        "worker.poll_error",
        error instanceof Error ? error : new Error(String(error)),
      );
      await sleep(pollIntervalMs, signal);
    }
  }
}
