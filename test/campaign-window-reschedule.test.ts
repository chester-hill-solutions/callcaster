/**
 * #1816 — editing a campaign window must reschedule a parked
 * `campaign_dispatch` successor.
 *
 * A deferred successor carries the next-open instant computed at defer time.
 * When the user widens/opens the window on a live machine campaign, the
 * chain must pull that queued job forward (or wake it now when the window
 * becomes unrestricted). The dispatch policy math stays REAL here; only the
 * two job-DB primitives are mocked. Expected boundaries are hand-computed
 * absolute instants, never read back from the function under test.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findLiveJobId: vi.fn(),
  rescheduleQueuedJob: vi.fn(),
}));

vi.mock("@/lib/worker/enqueue-job.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/worker/enqueue-job.server")>()),
  findLiveJobId: (...args: unknown[]) => mocks.findLiveJobId(...args),
  rescheduleQueuedJob: (...args: unknown[]) => mocks.rescheduleQueuedJob(...args),
}));

import { rescheduleDispatchAfterWindowEdit } from "@/lib/campaign-execution.server";

const MS_PER_MINUTE = 60 * 1000;

/** Monday 2026-08-24 in UTC. */
function utcAt(hours: number, minutes: number): Date {
  return new Date(Date.UTC(2026, 7, 24, hours, minutes));
}

/** Weekday send window: Monday 09:00–17:00 UTC (object form, as persisted). */
const MONDAY_9_TO_17_WINDOW = {
  monday: { active: true, intervals: [{ start: "09:00", end: "17:00" }] },
};

function campaign() {
  return {
    type: "message" as const,
    status: "running" as const,
    schedule: null,
    sms_send_window: MONDAY_9_TO_17_WINDOW,
    start_date: null,
    end_date: null,
  };
}

describe("rescheduleDispatchAfterWindowEdit", () => {
  beforeEach(() => {
    mocks.findLiveJobId.mockReset();
    mocks.rescheduleQueuedJob.mockReset();
  });

  test("pulls a parked successor forward to the exact new boundary when in reach", async () => {
    // Window edited to open 09:00; a parked successor may still sleep at an
    // old boundary. 08:30 now → the successor must land at Monday 09:00
    // exactly (within the 60-min cap, so no re-read hop).
    mocks.findLiveJobId.mockResolvedValue(42);
    mocks.rescheduleQueuedJob.mockResolvedValue(true);

    const changed = await rescheduleDispatchAfterWindowEdit({
      workspaceId: "ws-1",
      campaignId: 7,
      campaign: campaign(),
      now: utcAt(8, 30),
    });

    expect(changed).toBe(true);
    expect(mocks.findLiveJobId).toHaveBeenCalledWith({
      type: "campaign_dispatch",
      workspaceId: "ws-1",
      campaignId: 7,
    });
    expect(mocks.rescheduleQueuedJob).toHaveBeenCalledWith(42, utcAt(9, 0));
  });

  test("caps a far-future boundary so stale config cannot pin the chain", async () => {
    // Boundary 2h out (09:00 from 07:00) exceeds the 60-min defer cap. The
    // rescheduled successor must wake at now+60min to re-read the campaign
    // (and only then defer exactly to the true boundary) — same tradeoff as
    // the worker's SEND_WINDOW_MAX_DEFER_MS.
    mocks.findLiveJobId.mockResolvedValue(42);
    mocks.rescheduleQueuedJob.mockResolvedValue(true);

    const changed = await rescheduleDispatchAfterWindowEdit({
      workspaceId: "ws-1",
      campaignId: 7,
      campaign: campaign(),
      now: utcAt(7, 0),
    });

    expect(changed).toBe(true);
    const runAt = mocks.rescheduleQueuedJob.mock.calls[0]?.[1] as Date;
    expect(runAt.getTime()).toBe(utcAt(8, 0).getTime());
  });

  test("wakes the successor now when the edited window already includes now", async () => {
    mocks.findLiveJobId.mockResolvedValue(42);
    mocks.rescheduleQueuedJob.mockResolvedValue(true);

    const changed = await rescheduleDispatchAfterWindowEdit({
      workspaceId: "ws-1",
      campaignId: 7,
      campaign: campaign(),
      now: utcAt(10, 0), // inside Monday 09:00–17:00
    });

    expect(changed).toBe(true);
    const runAt = mocks.rescheduleQueuedJob.mock.calls[0]?.[1] as Date;
    expect(runAt.getTime()).toBe(utcAt(10, 0).getTime());
  });

  test("wakes the successor now when the window is unrestricted", async () => {
    // User removed the send window entirely → nothing to wait for → the
    // parked chain must resume immediately, not sleep to a stale instant.
    mocks.findLiveJobId.mockResolvedValue(42);
    mocks.rescheduleQueuedJob.mockResolvedValue(true);

    const changed = await rescheduleDispatchAfterWindowEdit({
      workspaceId: "ws-1",
      campaignId: 7,
      campaign: { ...campaign(), sms_send_window: null },
      now: utcAt(7, 0),
    });

    expect(changed).toBe(true);
    const runAt = mocks.rescheduleQueuedJob.mock.calls[0]?.[1] as Date;
    expect(runAt.getTime()).toBe(utcAt(7, 0).getTime());
  });

  test("does not touch the chain when no live dispatch job exists", async () => {
    mocks.findLiveJobId.mockResolvedValue(null);

    const changed = await rescheduleDispatchAfterWindowEdit({
      workspaceId: "ws-1",
      campaignId: 7,
      campaign: campaign(),
      now: utcAt(7, 0),
    });

    expect(changed).toBe(false);
    expect(mocks.rescheduleQueuedJob).not.toHaveBeenCalled();
  });

  test("does not reschedule a non-live campaign status", async () => {
    const changed = await rescheduleDispatchAfterWindowEdit({
      workspaceId: "ws-1",
      campaignId: 7,
      campaign: { ...campaign(), status: "paused" },
      now: utcAt(7, 0),
    });

    expect(changed).toBe(false);
    expect(mocks.findLiveJobId).not.toHaveBeenCalled();
    expect(mocks.rescheduleQueuedJob).not.toHaveBeenCalled();
  });

  test("does not reschedule a human-dialled live_call campaign", async () => {
    const changed = await rescheduleDispatchAfterWindowEdit({
      workspaceId: "ws-1",
      campaignId: 7,
      campaign: { ...campaign(), type: "live_call" },
      now: utcAt(7, 0),
    });

    expect(changed).toBe(false);
    expect(mocks.findLiveJobId).not.toHaveBeenCalled();
  });
});