import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { logger } from "@/lib/logger.server";
import { runWithRequestContext } from "@/lib/request-context.server";
import { captureException } from "@/lib/sentry.server";
import { notifyOps } from "@/lib/ops-alert.server";
import { PAGING_JOB_TYPES } from "@/lib/worker/handlers.server";

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

/**
 * Rows affected by a write, across drivers: postgres.js exposes `count`, pg
 * returns an array-like `{ rows }`. Read defensively rather than casting at
 * each call site.
 */
function affectedRowCount(result: unknown): number {
  if (Array.isArray(result)) return result.length;
  if (result && typeof result === "object" && "count" in result) {
    const { count } = result as { count?: unknown };
    return typeof count === "number" ? count : 0;
  }
  return 0;
}

export async function resetStaleClaims(): Promise<void> {
  // Reclaims are re-queued WITHOUT bumping attempt_count here: claimNextJob
  // increments attempt_count when it re-claims the row, so a crash-recovery
  // cycle costs exactly one attempt instead of two (reset + reclaim).
  // Deliberately NO `RETURNING`: the driver already reports affected rows, and
  // this runs every ~5s on the critical path of the entire job queue. A
  // RETURNING variant was the one delta in the query implicated in a dev crash
  // loop. It was never proven to be the cause — it reproduces fine against a
  // real Postgres — but a row count is a nicety and queue stability is not.
  const result = await db.execute(sql`
    UPDATE job
    SET status = 'queued',
        claimed_until = null,
        claimed_by = null,
        updated_at = now()
    WHERE status = 'running'
      AND claimed_until < now()
  `);

  // Logging unconditionally buried the signal in ~17k lines/day per worker; a
  // reset is only interesting when it actually reclaimed something, which
  // means a worker died mid-job.
  const reclaimed = affectedRowCount(result);
  if (reclaimed > 0) {
    logger.warn("worker.stale_claims_reset", { reclaimed });
  }

  await deadLetterExhaustedJobs();
}

/**
 * Dead-letter jobs that exhausted their attempts without ever throwing.
 *
 * failJob handles the normal path — a handler raises, the attempt is counted,
 * and the job is dead-lettered once it runs out. A job that kills the worker
 * process never reaches it, so those rows would otherwise sit `queued` at or
 * past max_attempts forever: invisible to the claim query (which now bounds on
 * attempt_count), never retried, never dead-lettered, and never surfaced on the
 * dead-letter admin page.
 */
async function deadLetterExhaustedJobs(): Promise<void> {
  // Same columns failJob writes on its terminal branch, so both kinds of
  // dead letter look identical to the admin page and to log search.
  const reason =
    "Exhausted max_attempts without a handler error — the worker process likely died mid-job.";
  const result = await db.execute(sql`
    UPDATE job
    SET status = 'dead_letter',
        failed_at = now(),
        dead_letter_reason = coalesce(dead_letter_reason, ${reason}),
        error_message = coalesce(error_message, ${reason}),
        updated_at = now()
    WHERE status = 'queued'
      AND attempt_count >= max_attempts
  `);

  const buried = affectedRowCount(result);
  if (buried > 0) {
    // A process-killing job is a different failure from a throwing one, and the
    // dead-letter page is the only place it becomes visible.
    logger.warn("worker.exhausted_jobs_dead_lettered", { buried });
  }
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
        -- Dead-lettering happens in failJob, which is only reached when a
        -- handler THROWS. A job that kills the process instead — OOM, an
        -- uncaughtException exit — never gets there: the platform restarts,
        -- resetStaleClaims re-queues the row after its TTL, and this SELECT
        -- picks it straight back up. Without this bound that is an unbounded
        -- crash loop that starves every other job, while attempt_count climbs
        -- past max_attempts with nothing reading it.
        AND attempt_count < max_attempts
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

    // Only money/compliance types page. A dead-lettered campaign_export is a
    // customer support ticket, not a 3am call — and dedupe is keyed on the job
    // TYPE, never the id: a campaign dispatching 10k rows that all fail would
    // otherwise send 10k emails.
    if (jobType && PAGING_JOB_TYPES.has(jobType)) {
      void notifyOps({
        event: "worker.job.dead_letter",
        summary: `Job "${jobType}" dead-lettered — work was permanently lost`,
        dedupeKey: `deadletter:${jobType}`,
        jobId,
        jobType,
        context: { attemptCount, maxAttempts, reason: error },
      });
    }
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

  // Best-effort boot recovery. This used to be un-guarded, so a transient
  // database error here escaped as an unhandled rejection and killed the
  // worker before the loop ever started — taking the whole job queue with it.
  // The loop below retries it every tick anyway.
  try {
    await resetStaleClaims();
  } catch (error) {
    logger.error("worker.stale_claims_reset_failed", {
      phase: "boot",
      error: error instanceof Error ? error.message : String(error),
      cause: error instanceof Error && error.cause instanceof Error
        ? error.cause.message
        : null,
    });
  }

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
