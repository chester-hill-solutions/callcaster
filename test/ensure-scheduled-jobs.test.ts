import { beforeEach, describe, expect, test, vi } from "vitest";

const enqueueJobMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/worker/enqueue-job.server", () => ({
  unsafeEnqueueJob: (...args: unknown[]) => enqueueJobMock(...args),
}));

vi.mock("@/lib/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  ensureSelfSchedulingJobsSeeded,
  SELF_SCHEDULING_JOB_TYPES,
  startScheduleWatchdog,
} from "@/lib/worker/ensure-scheduled-jobs.server";

describe("ensureSelfSchedulingJobsSeeded", () => {
  beforeEach(() => {
    enqueueJobMock.mockReset();
  });

  test("uses atomic live dedupe for each self-scheduling job type", async () => {
    enqueueJobMock.mockResolvedValue({ enqueued: false, deduped: true });

    const result = await ensureSelfSchedulingJobsSeeded();

    expect(enqueueJobMock).toHaveBeenCalledTimes(
      SELF_SCHEDULING_JOB_TYPES.length,
    );
    for (const call of enqueueJobMock.mock.calls) {
      expect(call[0]).toEqual(
        expect.objectContaining({ dedupe: { kind: "live" } }),
      );
    }
    expect(result.seeded).toEqual([]);
  });

  test("reports which job types were newly seeded", async () => {
    enqueueJobMock
      .mockResolvedValueOnce({ enqueued: true, jobId: 1 })
      .mockResolvedValue({ enqueued: false, deduped: true });

    const result = await ensureSelfSchedulingJobsSeeded();

    // Position-based, not identity-based: whichever type is first in the
    // (now registry-derived, #1239 A1) SELF_SCHEDULING_JOB_TYPES order gets
    // the one seed the mock allows through.
    expect(result.seeded).toEqual([SELF_SCHEDULING_JOB_TYPES[0]]);
  });

  test("the watchdog re-seeds every tick and stops on abort", async () => {
    vi.useFakeTimers();
    try {
      enqueueJobMock.mockResolvedValue({ enqueued: false, deduped: true });
      const controller = new AbortController();
      const perTick = SELF_SCHEDULING_JOB_TYPES.length;

      startScheduleWatchdog({ signal: controller.signal, intervalMs: 1_000 });
      expect(enqueueJobMock).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1_000);
      expect(enqueueJobMock).toHaveBeenCalledTimes(perTick);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(enqueueJobMock).toHaveBeenCalledTimes(perTick * 2);

      controller.abort();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(enqueueJobMock).toHaveBeenCalledTimes(perTick * 2);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a failed seed does not abort the remaining types", async () => {
    enqueueJobMock
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce({ enqueued: true, jobId: 7 })
      .mockResolvedValue({ enqueued: false, deduped: true });

    const result = await ensureSelfSchedulingJobsSeeded();

    expect(enqueueJobMock).toHaveBeenCalledTimes(
      SELF_SCHEDULING_JOB_TYPES.length,
    );
    // First type's seed rejects (and must not abort the loop), second
    // type's seed succeeds.
    expect(result.seeded).toEqual([SELF_SCHEDULING_JOB_TYPES[1]]);
  });
});
