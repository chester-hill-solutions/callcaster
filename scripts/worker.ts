#!/usr/bin/env bun
/**
 * Bun worker process for background job processing.
 * 
 * Claims jobs from the `job` table using `FOR UPDATE SKIP LOCKED`,
 * processes them via registered handlers, and updates status.
 * 
 * Usage:
 *   bun run ./scripts/worker.ts
 * 
 * Environment:
 *   DATABASE_URL - Postgres connection string
 *   WORKER_POLL_INTERVAL_MS - Poll interval (default: 5000)
 *   WORKER_CLAIM_TIMEOUT_MS - Claim timeout (default: 30000)
 */

import { sql } from "drizzle-orm";
import { db } from "../app/server/db";
import { logger } from "../app/lib/logger.server";

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? "5000");
const CLAIM_TIMEOUT_MS = Number(process.env.WORKER_CLAIM_TIMEOUT_MS ?? "30000");
const WORKER_ID = `bun-worker-${process.pid}-${Date.now()}`;

let shuttingDown = false;

async function claimJob() {
  const result = await db.execute(sql`
    WITH claimed AS (
      SELECT id, type, params
      FROM job
      WHERE status IN ('pending', 'claimed')
        AND (claimed_until IS NULL OR claimed_until < NOW())
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE job
    SET status = 'claimed',
        claimed_by = ${WORKER_ID},
        claimed_until = NOW() + ${CLAIM_TIMEOUT_MS / 1000} * INTERVAL '1 second',
        started_at = COALESCE(started_at, NOW())
    FROM claimed
    WHERE job.id = claimed.id
    RETURNING job.id, job.type, job.params, job.workspace
  `);

  return result[0] ?? null;
}

async function completeJob(jobId: number, result: unknown) {
  await db.execute(sql`
    UPDATE job
    SET status = 'completed',
        result = ${JSON.stringify(result)},
        completed_at = NOW()
    WHERE id = ${jobId}
  `);
}

async function failJob(jobId: number, errorMessage: string) {
  await db.execute(sql`
    UPDATE job
    SET status = 'failed',
        error_message = ${errorMessage},
        completed_at = NOW()
    WHERE id = ${jobId}
  `);
}

async function resetStaleClaims() {
  const result = await db.execute(sql`
    UPDATE job
    SET status = 'pending',
        claimed_by = NULL,
        claimed_until = NULL
    WHERE status = 'claimed'
      AND claimed_until < NOW()
  `);
  
  if (result.length > 0) {
    logger.info(`Reset ${result.length} stale job claims`);
  }
}

const handlers: Record<string, (params: unknown, workspaceId?: string) => Promise<unknown>> = {
  // Placeholder handlers - will be implemented per job type
  export: async () => ({ message: "Export handler not yet implemented" }),
  audience_upload: async () => ({ message: "Audience upload handler not yet implemented" }),
  billing_reconcile: async () => ({ message: "Billing reconcile handler not yet implemented" }),
  twilio_open_sync: async (params, workspaceId) => {
    const { triggerTwilioOpenSync } = await import("../app/lib/twilio-open-sync.server");
    const result = await triggerTwilioOpenSync({
      workspaceId: workspaceId ?? "",
      ...(params as Record<string, unknown>),
    });
    return result;
  },
  number_rental_billing: async (params, workspaceId) => {
    const { runNumberRentalBilling } = await import("../app/lib/number-rental-billing.server");
    return runNumberRentalBilling({ workspaceId });
  },
  campaign_dispatch: async () => ({ message: "Campaign dispatch handler not yet implemented" }),
  queue_next: async () => ({ message: "Queue next handler not yet implemented" }),
  workspace_twilio_sync: async () => ({ message: "Workspace Twilio sync handler not yet implemented" }),
};

async function processJob(job: { id: number; type: string; params: unknown; workspace: string | null }) {
  const handler = handlers[job.type];
  if (!handler) {
    throw new Error(`No handler registered for job type: ${job.type}`);
  }

  logger.info(`Processing job ${job.id} (${job.type})`, {
    jobId: job.id,
    type: job.type,
    workspaceId: job.workspace,
  });

  const result = await handler(job.params, job.workspace ?? undefined);
  await completeJob(job.id, result);

  logger.info(`Completed job ${job.id}`, { result });
}

async function workerLoop() {
  while (!shuttingDown) {
    try {
      await resetStaleClaims();

      const job = await claimJob();
      if (job) {
        try {
          await processJob({
            id: job.id,
            type: job.type,
            params: job.params,
            workspace: job.workspace,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error(`Job ${job.id} failed`, { error: message });
          await failJob(job.id, message);
        }
      } else {
        // No jobs available, wait before polling again
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Worker loop error", { error: message });
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

function setupSignalHandlers() {
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received. Shutting down worker...`);
    
    // Release any claimed jobs
    db.execute(sql`
      UPDATE job
      SET status = 'pending',
          claimed_by = NULL,
          claimed_until = NULL
      WHERE status = 'claimed'
        AND claimed_by = ${WORKER_ID}
    `).then(() => {
      logger.info("Released claimed jobs");
      process.exit(0);
    }).catch((error) => {
      logger.error("Error releasing jobs", { error });
      process.exit(1);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

async function main() {
  logger.info("Bun worker starting", {
    workerId: WORKER_ID,
    pollInterval: POLL_INTERVAL_MS,
    claimTimeout: CLAIM_TIMEOUT_MS,
  });

  setupSignalHandlers();
  await workerLoop();
}

main().catch((error) => {
  logger.error("Worker failed to start", { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
