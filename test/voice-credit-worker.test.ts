import { afterEach, beforeEach, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({ recovery: vi.fn(), enqueue: vi.fn() }));
vi.mock("@/lib/voice-credit-recovery.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/voice-credit-recovery.server")>(),
  runVoiceCreditRecovery: boundary.recovery,
}));
vi.mock("@/lib/worker/enqueue-job.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/worker/enqueue-job.server")>(),
  unsafeEnqueueJob: boundary.enqueue,
}));
import { jobHandlers } from "@/lib/worker/handlers.server";
import type { ClaimedJobRow } from "@/lib/worker/poll-jobs.server";
const job: ClaimedJobRow = { id: 2879, type: "voice_credit_recovery", params: {}, workspace_id: null, user_id: null, attempt_count: 1, max_attempts: 3 };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-29T12:00:00Z"));
  boundary.recovery.mockResolvedValue({ examined: 1, settled: 1, released: 0, pending: 0 });
  boundary.enqueue.mockResolvedValue({ enqueued: true });
});
afterEach(() => { vi.useRealTimers(); });
test.each([false, true])("recovery schedules its next minute, including after storage failure=%s", async (fail) => {
  if (fail) boundary.recovery.mockRejectedValue(new Error("Owned recovery storage failure"));
  const result = jobHandlers.voice_credit_recovery(job);
  if (fail) await expect(result).rejects.toThrow("Owned recovery storage failure"); else await result;
  expect(boundary.recovery).toHaveBeenCalledOnce();
  expect(boundary.enqueue).toHaveBeenCalledExactlyOnceWith({
    type: "voice_credit_recovery", params: {}, runAt: "2026-10-29T12:01:00.000Z",
    dedupe: { kind: "live", excludeJobId: 2879 },
  });
});
