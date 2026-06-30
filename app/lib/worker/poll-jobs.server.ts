import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { logger } from "@/lib/logger.server";

const POLL_INTERVAL_MS = 5_000;

export type ClaimedJobRow = {
  id: number;
  type: string;
  params: unknown;
  workspace_id: string | null;
  user_id: string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function claimNextJob(): Promise<ClaimedJobRow | null> {
  const rows = (await db.execute(sql`
    update job
    set status = 'running', updated_at = now()
    where id = (
      select id from job
      where status = 'queued'
      order by created_at asc
      for update skip locked
      limit 1
    )
    returning id, type, params, workspace_id, user_id
  `)) as ClaimedJobRow[];

  return rows[0] ?? null;
}

async function markJobFailed(jobId: number, error: string): Promise<void> {
  await db.execute(sql`
    update job
    set status = 'failed', error = ${error}, updated_at = now()
    where id = ${jobId}
  `);
}

async function processJob(job: ClaimedJobRow): Promise<void> {
  logger.info("worker.job.claimed", {
    jobId: job.id,
    type: job.type,
    workspaceId: job.workspace_id,
  });
  await markJobFailed(job.id, "no handler registered (worker stub)");
}

export async function runWorkerPollLoop(signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    try {
      const job = await claimNextJob();
      if (!job) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      await processJob(job);
    } catch (error) {
      logger.error("worker.poll_error", error);
      await sleep(POLL_INTERVAL_MS);
    }
  }
}
