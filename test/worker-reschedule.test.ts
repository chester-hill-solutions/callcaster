import { beforeEach, describe, expect, test, vi } from "vitest";

const enqueueJobMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/worker/enqueue-job.server", () => ({
  unsafeEnqueueJob: (...args: unknown[]) => enqueueJobMock(...args),
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
    // `rescheduleJob` is typed (#1239 A3) against the same registered-job
    // schemas every other enqueue call site validates against — params must
    // match `billing_reconcile`'s schema (`{workspaceId?: string}`), not an
    // arbitrary shape.
    await rescheduleJob("billing_reconcile", 60_000, { workspaceId: "ws_1" }, 41);

    expect(enqueueJobMock).toHaveBeenCalledWith({
      type: "billing_reconcile",
      params: { workspaceId: "ws_1" },
      runAt: "2026-07-14T18:01:00.000Z",
      dedupe: {
        kind: "live",
        excludeJobId: 41,
      },
    });
  });
});
