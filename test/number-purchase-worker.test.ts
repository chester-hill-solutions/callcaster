import { afterEach, beforeEach, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({ recovery: vi.fn(), enqueue: vi.fn() }));
vi.mock("@/lib/number-purchase-recovery.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/number-purchase-recovery.server")>(),
  runNumberPurchaseRecovery: boundary.recovery,
}));
vi.mock("@/lib/worker/enqueue-job.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/worker/enqueue-job.server")>(),
  unsafeEnqueueJob: boundary.enqueue,
}));
import { jobHandlers } from "@/lib/worker/handlers.server";
import type { ClaimedJobRow } from "@/lib/worker/poll-jobs.server";
const job: ClaimedJobRow = { id: 2084, type: "number_purchase_recovery", params: {}, workspace_id: null, user_id: null, attempt_count: 1, max_attempts: 3 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-06T00:00:00Z"));
  boundary.recovery.mockResolvedValue({ examined: 1, cancelled: 1, pending: 0 });
  boundary.enqueue.mockResolvedValue({ enqueued: true });
});
afterEach(() => { vi.useRealTimers(); });

function expectSuccessor() {
  expect(boundary.enqueue).toHaveBeenCalledOnce();
  expect(boundary.enqueue).toHaveBeenCalledWith({
    type: "number_purchase_recovery", params: {}, runAt: "2026-10-06T00:01:00.000Z",
    dedupe: { kind: "live", excludeJobId: 2084 },
  });
}
test("registered recovery runs and schedules its next minute", async () => {
  await jobHandlers.number_purchase_recovery(job);
  expect(boundary.recovery).toHaveBeenCalledOnce();
  expectSuccessor();
});
test("a failed recovery tick still schedules its successor", async () => {
  boundary.recovery.mockRejectedValue(new Error("Synthetic recovery storage failure"));
  await expect(jobHandlers.number_purchase_recovery(job)).rejects.toThrow("Synthetic recovery storage failure");
  expectSuccessor();
});
