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
import { validateWorkerEnv } from "../app/lib/worker/validate-worker-env.ts";
import {
  runWorkerPollLoop,
  resetStaleClaims,
  claimJob,
  completeJob,
  failJob,
} from "../app/lib/adapters/jobqueue.adapter.server.ts";
import { jobHandlers } from "../app/lib/worker/handlers.server.ts";
import { ensureSelfSchedulingJobsSeeded } from "../app/lib/worker/ensure-scheduled-jobs.server.ts";
import {
  captureException,
  initializeSentry,
} from "../app/lib/sentry.server.ts";
import { notifyOps } from "../app/lib/ops-alert.server.ts";

initializeSentry("callcaster-worker");

try {
  validateWorkerEnv(process.env);
} catch (error) {
  // A worker that cannot boot means the whole job queue is dead — including
  // every billing debit. Highest-value single alert in the system.
  await notifyOps({
    event: "worker.boot_failed",
    summary: "Worker failed to boot — the job queue is not running",
    error,
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
/**
 * These handlers previously called captureException ONLY — which is a no-op
 * without a Sentry DSN, so an uncaught error in the worker produced literally
 * zero output and left the process alive in an unknown state. The entire job
 * queue (including both billing debit paths) runs here.
 */
process.on("uncaughtException", (error) => {
  void withAlertTimeout(
    notifyOps({
      event: "worker.uncaught_exception",
      summary: "Worker hit an uncaught exception and is restarting",
      error,
    }),
  ).finally(() => {
    // Exit so Railway restarts us: continuing in an undefined state is worse
    // than a restart, and the 1h dedupe means a crash-loop is one email.
    process.exit(1);
  });
});

process.on("unhandledRejection", (reason) => {
  // Deliberately does not exit, mirroring the web server's default.
  void withAlertTimeout(
    notifyOps({
      event: "worker.unhandled_rejection",
      summary: "Worker hit an unhandled promise rejection",
      error: reason,
    }),
  );
});

/** An alert must never delay shutdown indefinitely. */
function withAlertTimeout<T>(promise: Promise<T>): Promise<unknown> {
  return Promise.race([
    promise.catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
}

// Seed the first row for self-re-enqueuing job types (low-credit notify,
// webhook audit) so a fresh database never needs the manual insert from the
// ops runbook. Idempotent: no-ops when a live row already exists.
await ensureSelfSchedulingJobsSeeded();

if (mode === "drain") {
  // Recover any claims stranded by a prior crash/redeploy before attempting
  // to claim a job, matching the long-running poll loop's per-iteration reset.
  await resetStaleClaims();

  const job = await claimJob(workerId);
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
    await failJob({
      jobId: job.id,
      attemptCount: job.attempt_count,
      maxAttempts: job.max_attempts,
      error: `No handler registered for job type: ${job.type}`,
      jobType: job.type,
      workerId,
    });
    process.exit(1);
  }

  try {
    const result = await handler(job);
    await completeJob(job.id, result, workerId);
    console.info("worker.drain", { jobId: job.id, status: "completed" });
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    captureException(error, {
      source: "worker.drain",
      jobId: job.id,
      jobType: job.type,
    });
    console.error("worker.drain", { jobId: job.id, error: message });
    await failJob({
      jobId: job.id,
      attemptCount: job.attempt_count,
      maxAttempts: job.max_attempts,
      error: message,
      jobType: job.type,
      workerId,
    });
    process.exit(1);
  }
}

console.info("worker.start", { mode, workerId });
await runWorkerPollLoop(abort.signal, jobHandlers);
console.info("worker.shutdown");
