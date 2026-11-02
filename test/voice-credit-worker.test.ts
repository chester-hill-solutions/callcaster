import { afterEach, beforeEach, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({ recovery: vi.fn(), audio: vi.fn(), recordings: vi.fn(), stops: vi.fn(), enqueue: vi.fn() }));
vi.mock("@/lib/voice-credit-recovery.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/voice-credit-recovery.server")>(),
  runVoiceCreditRecovery: boundary.recovery,
}));
vi.mock("@/lib/voice-audio-recovery.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/voice-audio-recovery.server")>(),
  runVoiceAudioRecovery: boundary.audio,
}));
vi.mock("@/lib/voice-recording-recovery.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/voice-recording-recovery.server")>(),
  runVoiceRecordingRecovery: boundary.recordings,
}));
vi.mock("@/lib/voice-dialer-stop.server", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/voice-dialer-stop.server")>(),
  runDialerStopRecovery: boundary.stops,
}));
vi.mock("@/lib/worker/enqueue-job.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/worker/enqueue-job.server")>(),
  unsafeEnqueueJob: boundary.enqueue,
}));
import { jobHandlers } from "@/lib/worker/handlers.server";
import type { ClaimedJobRow } from "@/lib/worker/poll-jobs.server";
const job: ClaimedJobRow = { id: 2879, type: "voice_credit_recovery", params: {}, workspace_id: null, user_id: null, attempt_count: 1, max_attempts: 3 };
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-29T12:00:00Z"));
  boundary.recovery.mockResolvedValue({ examined: 1, settled: 1, released: 0, pending: 0 });
  boundary.audio.mockResolvedValue({ examined: 1, closed: 1, expired: 0, pending: 0 });
  boundary.recordings.mockResolvedValue({ lifecycle: { examined: 1, closed: 1, pending: 0 }, copies: { examined: 1, enqueued: 1, pending: 0 } });
  boundary.stops.mockResolvedValue({ examined: 1, stopped: 1, pending: 0 });
  boundary.enqueue.mockResolvedValue({ enqueued: true });
});
afterEach(() => { vi.useRealTimers(); });
test.each(["none", "funded", "audio", "recordings", "stops"])("recovery schedules its next minute after failure in %s", async (fail) => {
  if (fail === "funded") boundary.recovery.mockRejectedValue(new Error("Owned recovery storage failure"));
  if (fail === "audio") boundary.audio.mockRejectedValue(new Error("Owned recovery storage failure"));
  if (fail === "recordings") boundary.recordings.mockRejectedValue(new Error("Owned recovery storage failure"));
  if (fail === "stops") boundary.stops.mockRejectedValue(new Error("Owned recovery storage failure"));
  const result = jobHandlers.voice_credit_recovery(job);
  if (fail !== "none") await expect(result).rejects.toThrow("Owned recovery storage failure"); else await result;
  expect(boundary.recovery).toHaveBeenCalledOnce();
  if (fail !== "funded") expect(boundary.audio).toHaveBeenCalledOnce();
  if (fail !== "funded" && fail !== "audio") expect(boundary.recordings).toHaveBeenCalledOnce();
  if (fail === "none" || fail === "stops") expect(boundary.stops).toHaveBeenCalledOnce();
  expect(boundary.enqueue).toHaveBeenCalledExactlyOnceWith({
    type: "voice_credit_recovery", params: {}, runAt: "2026-10-29T12:01:00.000Z",
    dedupe: { kind: "live", excludeJobId: 2879 },
  });
});
