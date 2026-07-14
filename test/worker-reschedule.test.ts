import { beforeEach, describe, expect, test, vi } from "vitest";

const enqueueJobMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/worker/enqueue-job.server", () => ({
  enqueueJob: (...args: unknown[]) => enqueueJobMock(...args),
}));

vi.mock("@/lib/logger.server", () => ({
  logger: { error: vi.fn() },
}));

import { rescheduleJob } from "@/lib/worker/handlers/shared.server";

describe("rescheduleJob", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T18:00:00.000Z"));
    enqueueJobMock.mockReset();
    enqueueJobMock.mockResolvedValue({ enqueued: true, jobId: 2 });
  });

  test("uses unified enqueue with runAt and ignores the current running job", async () => {
    await rescheduleJob("billing_reconcile", 60_000, { source: "cron" }, 41);

    expect(enqueueJobMock).toHaveBeenCalledWith({
      type: "billing_reconcile",
      params: { source: "cron" },
      runAt: "2026-07-14T18:01:00.000Z",
      dedupe: {
        kind: "live",
        excludeJobId: 41,
      },
    });
  });
});
