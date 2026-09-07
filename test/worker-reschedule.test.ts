import { beforeEach, describe, expect, test, vi } from "vitest";

const enqueueJobMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/worker/enqueue-job.server", () => ({
  unsafeEnqueueJob: (...args: unknown[]) => enqueueJobMock(...args),
}));

vi.mock("@/lib/logger.server", () => ({
  logger: { error: vi.fn() },
}));

const notifyOpsMock = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
vi.mock("@/lib/ops-alert.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ops-alert.server")>()),
  notifyOps: (...args: unknown[]) => notifyOpsMock(...args),
}));

import { rescheduleJob } from "@/lib/worker/handlers/shared.server";

describe("rescheduleJob", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T18:00:00.000Z"));
    enqueueJobMock.mockReset();
    enqueueJobMock.mockResolvedValue({ enqueued: true, jobId: 2 });
    notifyOpsMock.mockClear();
  });

  test("a failed successor enqueue pages ops and does not throw out of the finally block", async () => {
    enqueueJobMock.mockRejectedValueOnce(new Error("lock timeout"));

    await expect(
      rescheduleJob("billing_reconcile", 60_000, { workspaceId: "ws_1" }, 41),
    ).resolves.toBeUndefined();

    expect(notifyOpsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "worker.reschedule_failed",
        dedupeKey: "reschedule_failed:billing_reconcile",
        jobId: 41,
        jobType: "billing_reconcile",
        context: { error: "lock timeout" },
      }),
    );
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
