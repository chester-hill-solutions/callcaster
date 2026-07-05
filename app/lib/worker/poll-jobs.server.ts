import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { logger } from "@/lib/logger.server";

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
  await db.execute(sql`
    UPDATE job
    SET status = 'queued',
        claimed_until = null,
        claimed_by = null,
        attempt_count = attempt_count + 1,
        updated_at = now()
    WHERE status = 'running'
      AND claimed_until < now()
  `);
  logger.info("worker.stale_claims_reset");
}

export async function claimNextJob(
  workerId: string,
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
          claimed_until = now() + interval '5 minutes',
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
      SET status = 'failed',
          failed_at = now(),
          dead_letter_reason = ${error},
          error_message = ${error},
          updated_at = now()
      WHERE id = ${jobId}
    `);
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
      const job = await claimNextJob(workerId);
      if (!job) {
        await sleep(pollIntervalMs, signal);
        continue;
      }

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
        logger.error("worker.job.failed", { jobId: job.id, error: message });
        await failJob(job.id, job.attempt_count, job.max_attempts, message);
      } finally {
        clearInterval(heartbeat);
      }

      if (signal.aborted) break;
      await sleep(pollIntervalMs, signal);
    } catch (error) {
      logger.error(
        "worker.poll_error",
        error instanceof Error ? error : new Error(String(error)),
      );
      await sleep(pollIntervalMs, signal);
    }
  }
}
