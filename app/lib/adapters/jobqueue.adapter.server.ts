/**
 * Thin adapter for `@chester-hill-solutions/jobqueue` (not yet published).
 *
 * Re-exports the local poll-jobs implementation under package-shaped names so
 * call sites can migrate to the CHS package by changing imports here only.
 *
 * @see docs/chs-package-adoption.md
 */
export {
  claimNextJob as claimJob,
  completeJob,
  failJob,
  resetStaleClaims,
  runWorkerPollLoop,
  getWorkerId,
  type ClaimedJobRow as ClaimedJob,
  type JobHandler,
  type JobHandlers,
  type WorkerOptions,
} from "@/lib/worker/poll-jobs.server";
