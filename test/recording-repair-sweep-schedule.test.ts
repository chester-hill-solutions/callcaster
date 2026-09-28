import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  enqueueJob: vi.fn(async () => ({ enqueued: true })),
  runRecordingRepairSweep: vi.fn(async () => ({
    scanned: 0,
    requeued: 0,
    skippedUnservable: 0,
    enqueueFailed: 0,
  })),
}));

// Mock the enqueue layer rather than rescheduleJob: the handler goes through
// withReschedule -> rescheduleJob -> enqueueRegisteredJob -> unsafeEnqueueJob,
// and stubbing the middle of that chain would not exercise the ordering
// guarantee these tests exist for. Same choice as
// test/worker-cron-handlers.server.test.ts.
vi.mock("@/lib/worker/enqueue-job.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/worker/enqueue-job.server")>()),
  unsafeEnqueueJob: (...args: unknown[]) => mocks.enqueueJob(...args),
}));

// The sweep itself is not under test here (test/call-recording-repair.server.test.ts
// covers it). Running it for real would query the `call` table, so the module
// is stubbed. Spread the real module so its other exports stay reachable.
vi.mock("@/lib/call-recording-repair.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/call-recording-repair.server")>()),
  runRecordingRepairSweep: () => mocks.runRecordingRepairSweep(),
}));

import { jobRegistry } from "@/lib/worker/handlers.server";
import type { ClaimedJobRow } from "@/lib/worker/poll-jobs.server";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The registry's own registration, not a handler imported from
 * `handlers/cron.server.ts` like the other self-reschedule tests use. The
 * sweep's handler is declared inline in `handlers.server.ts`, so the registry
 * is the only seam that can reach it.
 */
function repairSweepRegistration() {
  const registration = jobRegistry.find((r) => r.type === "recording_repair_sweep");
  if (!registration) {
    throw new Error('jobRegistry has no registration for "recording_repair_sweep"');
  }
  return registration;
}

function makeJob(overrides: Partial<ClaimedJobRow> = {}): ClaimedJobRow {
  return {
    id: 77,
    type: "recording_repair_sweep",
    params: {},
    workspace_id: null,
    user_id: null,
    attempt_count: 1,
    max_attempts: 3,
    ...overrides,
  };
}

/** The one enqueue the handler's reschedule produced. Fails if there isn't exactly one. */
function soleEnqueue() {
  expect(mocks.enqueueJob).toHaveBeenCalledTimes(1);
  const call = mocks.enqueueJob.mock.calls[0];
  if (!call) {
    throw new Error("expected the handler to enqueue a successor, but it made no call");
  }
  return call[0] as {
    type: string;
    params: unknown;
    runAt: string;
    dedupe: { kind: string; excludeJobId: number };
  };
}

describe("recording_repair_sweep self-reschedule gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enqueueJob.mockResolvedValue({ enqueued: true });
  });

  test("runs the sweep and self-reschedules", async () => {
    await repairSweepRegistration().jobHandler(makeJob());

    expect(mocks.runRecordingRepairSweep).toHaveBeenCalledTimes(1);
    expect(soleEnqueue().type).toBe("recording_repair_sweep");
  });

  /**
   * The cadence guard, and the reason this file exists.
   *
   * There is no pg_cron: these self-scheduling chains ARE the scheduler. A
   * handler that does not wrap itself in `withReschedule` runs once, its chain
   * dies, and `startScheduleWatchdog` re-seeds it every
   * `SCHEDULE_WATCHDOG_INTERVAL_MS` (10 minutes). The sweep would then
   * re-enqueue its whole candidate set six times an hour, forever.
   *
   * Daily is the contract — the same cadence `billing_reconcile`,
   * `number_rental_billing` and `low_credit_notify` use. Asserting only that
   * "an enqueue happened" cannot catch this: the 10-minute watchdog reseed also
   * enqueues, and the two are indistinguishable at that level. So this pins the
   * actual delay.
   */
  test("schedules the next run a day out, not at the 10-minute watchdog cadence", async () => {
    const before = Date.now();
    await repairSweepRegistration().jobHandler(makeJob());
    const after = Date.now();

    const runAt = new Date(soleEnqueue().runAt).getTime();
    // `runAt` is computed as (some instant during this await) + the delay, so
    // bracketing it between the clock either side of the call pins the delay
    // exactly with no tolerance for clock skew to hide inside.
    expect(runAt - before).toBeGreaterThanOrEqual(DAY_MS);
    expect(runAt - after).toBeLessThanOrEqual(DAY_MS);
  });

  /**
   * Rescheduling happens in `finally`, so a failing tick still schedules its
   * successor. Without this the sweep gets exactly one attempt per worker
   * deploy and then goes quiet until someone restarts it — silently, on the
   * one job that recovers lost call audio.
   */
  test("still reschedules when the sweep throws", async () => {
    mocks.runRecordingRepairSweep.mockRejectedValueOnce(new Error("db down"));

    await expect(
      repairSweepRegistration().jobHandler(makeJob()),
    ).rejects.toThrow("db down");

    expect(soleEnqueue().type).toBe("recording_repair_sweep");
  });

  /**
   * The successor must dedupe on a live row EXCLUDING the job that just
   * finished. Including it would make the new row collide with the current one
   * while the current row is still live, and the chain would stop after one run
   * — the same silent death as no reschedule at all.
   */
  test("dedupes the successor against a live row other than the job that just ran", async () => {
    await repairSweepRegistration().jobHandler(makeJob({ id: 4242 }));

    expect(soleEnqueue().dedupe).toEqual({ kind: "live", excludeJobId: 4242 });
  });
});
