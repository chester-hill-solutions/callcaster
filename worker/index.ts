/**
 * Bun worker entry (ADR-0007).
 *
 * Modes:
 * - `server` (default): HTTP /health + poll loop
 * - `drain`: run one poll cycle then exit (cron fallback)
 */
import { runWorkerPollLoop } from "../app/lib/worker/poll-jobs.server.ts";

const mode = process.env.WORKER_MODE ?? "server";
const port = Number(process.env.WORKER_PORT ?? "3100");

const abort = new AbortController();

function startHealthServer(): void {
  Bun.serve({
    port,
    fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/health") {
        return Response.json({ ok: true, mode });
      }
      if (url.pathname === "/internal/jobs/wake" && request.method === "POST") {
        return Response.json({ ok: true, message: "wake received" });
      }
      return new Response("Not Found", { status: 404 });
    },
  });
  console.info(`worker.health listening on :${port}`);
}

process.on("SIGINT", () => abort.abort());
process.on("SIGTERM", () => abort.abort());

if (mode === "drain") {
  const { claimNextJob } = await import("../app/lib/worker/poll-jobs.server.ts");
  const job = await claimNextJob();
  console.info("worker.drain", job ? { jobId: job.id, type: job.type } : "idle");
  process.exit(0);
}

startHealthServer();
console.info("worker.start", { mode });
await runWorkerPollLoop(abort.signal);
