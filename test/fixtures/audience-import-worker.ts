import { pool, directPool } from "../../app/server/db";
import { jobHandlers } from "../../app/lib/worker/handlers.server";
import { runWorkerPollLoop } from "../../app/lib/worker/poll-jobs.server";

const jobId = Number(process.argv[2]);
if (!Number.isSafeInteger(jobId)) throw new Error("Fixture job ID required");
const abort = new AbortController();
const deadline = setTimeout(() => abort.abort(), 20_000);
const observer = setInterval(async () => {
  const [job] = await pool`select status from job where id=${jobId}`;
  if (job?.status === "completed" || job?.status === "dead_letter") abort.abort();
}, 20);
try {
  await runWorkerPollLoop(abort.signal, jobHandlers, { pollIntervalMs: 10, heartbeatIntervalMs: 50, jobTypeFilter: { include: "audience_upload" } });
  const [job] = await pool`select status,result from job where id=${jobId}`;
  process.stdout.write(`${JSON.stringify(job)}\n`);
  if (job?.status !== "completed") process.exitCode = 1;
} finally {
  clearInterval(observer); clearTimeout(deadline);
  await Promise.all([pool.end(), directPool.end()]);
}
