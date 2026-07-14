#!/usr/bin/env bun
/**
 * Bun worker entry (ADR-0007).
 *
 * Modes:
 * - `long-running` (default): poll loop with SIGTERM/SIGINT graceful shutdown
 * - `drain`: process one job and exit
 *
 * Usage:
 *   bun run ./worker/index.ts
 *   bun run ./worker/index.ts drain
 *   bun run ./worker/index.ts --mode=drain
 */
import { validateRequiredEnv } from "../app/lib/required-env-keys.mjs";
import { runWorkerPollLoop, resetStaleClaims, claimNextJob, completeJob, failJob } from "../app/lib/worker/poll-jobs.server.ts";
import { jobHandlers } from "../app/lib/worker/handlers.server.ts";
import { ensureSelfSchedulingJobsSeeded } from "../app/lib/worker/ensure-scheduled-jobs.server.ts";

try {
  validateRequiredEnv(process.env);
} catch (error) {
  console.error("worker.boot_failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
}

function parseMode(argv: string[]): "long-running" | "drain" {
  for (const arg of argv) {
    const lower = arg.toLowerCase();
    if (lower === "drain" || lower === "--drain" || lower.startsWith("--mode=drain")) {
      return "drain";
    }
  }
  return "long-running";
}

const mode = parseMode(process.argv.slice(2));
const workerId = `bun-worker-${process.pid}-${Date.now()}`;
const abort = new AbortController();

function shutdown(signal: string) {
  if (abort.signal.aborted) return;
  console.info(`worker.${signal}_received`, { message: "Finishing current job before exiting..." });
  abort.abort();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Seed the first row for self-re-enqueuing job types (low-credit notify,
// webhook audit) so a fresh database never needs the manual insert from the
// ops runbook. Idempotent: no-ops when a live row already exists.
await ensureSelfSchedulingJobsSeeded();

if (mode === "drain") {
  // Recover any claims stranded by a prior crash/redeploy before attempting
  // to claim a job, matching the long-running poll loop's per-iteration reset.
  await resetStaleClaims();

  const job = await claimNextJob(workerId);
  if (!job) {
    console.info("worker.drain", { message: "idle" });
    process.exit(0);
  }

  console.info("worker.drain", { jobId: job.id, type: job.type });
  const handler = jobHandlers[job.type];
  if (!handler) {
    console.error("worker.drain", {
      jobId: job.id,
      error: `No handler registered for job type: ${job.type}`,
    });
    await failJob(job.id, job.attempt_count, job.max_attempts, `No handler registered for job type: ${job.type}`, job.type);
    process.exit(1);
  }

  try {
    const result = await handler(job);
    await completeJob(job.id, result);
    console.info("worker.drain", { jobId: job.id, status: "completed" });
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("worker.drain", { jobId: job.id, error: message });
    await failJob(job.id, job.attempt_count, job.max_attempts, message, job.type);
    process.exit(1);
  }
}

console.info("worker.start", { mode, workerId });
await runWorkerPollLoop(abort.signal, jobHandlers);
console.info("worker.shutdown");
