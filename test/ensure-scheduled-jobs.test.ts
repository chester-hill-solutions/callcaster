import { beforeEach, describe, expect, test, vi } from "vitest";

const enqueueJobMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/worker/enqueue-job.server", () => ({
  enqueueJob: (...args: unknown[]) => enqueueJobMock(...args),
}));

vi.mock("@/lib/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  ensureSelfSchedulingJobsSeeded,
  SELF_SCHEDULING_JOB_TYPES,
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

    expect(result.seeded).toEqual(["low_credit_notify"]);
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
    expect(result.seeded).toEqual(["twilio_webhook_audit"]);
  });
});
