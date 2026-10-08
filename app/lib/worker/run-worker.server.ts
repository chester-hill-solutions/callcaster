import {
  runWorkerPollLoop,
  type JobHandlers,
  type WorkerOptions,
} from "@/lib/adapters/jobqueue.adapter.server";
import { WEBHOOK_DELIVERY_JOB_TYPE } from "@/lib/worker/job-types.server";

export async function runWorkerJobLanes(
  signal: AbortSignal,
  handlers: JobHandlers,
  options: Omit<WorkerOptions, "jobTypeFilter"> = {},
): Promise<void> {
  await Promise.all([
    runWorkerPollLoop(signal, handlers, {
      ...options,
      jobTypeFilter: { exclude: WEBHOOK_DELIVERY_JOB_TYPE },
    }),
    runWorkerPollLoop(signal, handlers, {
      ...options,
      jobTypeFilter: { include: WEBHOOK_DELIVERY_JOB_TYPE },
    }),
  ]);
}
