import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(async () => [] as unknown[]),
  updateCampaignStatusInWorkspace: vi.fn(async () => ({})),
}));

vi.mock("@/server/admin-db", () => ({
  adminDb: {
    query: {
      campaign: {
        findMany: (...args: unknown[]) => mocks.findMany(...args),
      },
    },
  },
}));
vi.mock("@/lib/campaign-ivr.server", () => ({
  updateCampaignStatusInWorkspace: (...args: unknown[]) =>
    mocks.updateCampaignStatusInWorkspace(...args),
}));
vi.mock("@/lib/logger.server", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { runCampaignScheduleSync } from "@/lib/campaign-schedule-sync.server";

// 2026-08-12 is a Wednesday; freeze the sweep at 15:00 UTC.
const NOW = new Date("2026-08-12T15:00:00.000Z");

const OPEN_WEDNESDAY = {
  wednesday: { active: true, intervals: [{ start: "09:00", end: "21:00" }] },
};
const CLOSED_WEDNESDAY = {
  wednesday: { active: true, intervals: [{ start: "16:00", end: "21:00" }] },
};

function makeCampaign(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    workspace: "ws-1",
    status: "running",
    schedule: OPEN_WEDNESDAY,
    start_date: "2026-08-01T00:00:00.000Z",
    end_date: "2026-08-31T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("runCampaignScheduleSync", () => {
  test("running campaign inside its window is left alone", async () => {
    mocks.findMany.mockResolvedValueOnce([makeCampaign()]);

    const result = await runCampaignScheduleSync();

    expect(result).toEqual({ scanned: 1, transitioned: 0 });
    expect(mocks.updateCampaignStatusInWorkspace).not.toHaveBeenCalled();
  });

  test("running campaign outside its window flips to waiting", async () => {
    mocks.findMany.mockResolvedValueOnce([
      makeCampaign({ schedule: CLOSED_WEDNESDAY }),
    ]);

    const result = await runCampaignScheduleSync();

    expect(result.transitioned).toBe(1);
    expect(mocks.updateCampaignStatusInWorkspace).toHaveBeenCalledWith(
      "ws-1",
      1,
      { status: "waiting" },
    );
  });

  test("waiting campaign inside its window flips back to running", async () => {
    mocks.findMany.mockResolvedValueOnce([makeCampaign({ status: "waiting" })]);

    const result = await runCampaignScheduleSync();

    expect(result.transitioned).toBe(1);
    expect(mocks.updateCampaignStatusInWorkspace).toHaveBeenCalledWith(
      "ws-1",
      1,
      { status: "running" },
    );
  });

  test("campaign outside its date range is never flipped", async () => {
    mocks.findMany.mockResolvedValueOnce([
      makeCampaign({
        schedule: CLOSED_WEDNESDAY,
        start_date: "2026-07-01T00:00:00.000Z",
        end_date: "2026-07-31T00:00:00.000Z",
      }),
    ]);

    const result = await runCampaignScheduleSync();

    expect(result.transitioned).toBe(0);
    expect(mocks.updateCampaignStatusInWorkspace).not.toHaveBeenCalled();
  });

  test("campaign with a schedule missing today reads as outside the window", async () => {
    mocks.findMany.mockResolvedValueOnce([
      makeCampaign({ schedule: { monday: { active: true, intervals: [] } } }),
    ]);

    const result = await runCampaignScheduleSync();

    expect(mocks.updateCampaignStatusInWorkspace).toHaveBeenCalledWith(
      "ws-1",
      1,
      { status: "waiting" },
    );
    expect(result.transitioned).toBe(1);
  });

  test("one failed update does not stop the sweep", async () => {
    mocks.findMany.mockResolvedValueOnce([
      makeCampaign({ id: 1, schedule: CLOSED_WEDNESDAY }),
      makeCampaign({ id: 2, schedule: CLOSED_WEDNESDAY }),
    ]);
    mocks.updateCampaignStatusInWorkspace
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({});

    const result = await runCampaignScheduleSync();

    expect(mocks.updateCampaignStatusInWorkspace).toHaveBeenCalledTimes(2);
    expect(result.transitioned).toBe(1);
  });

  test("rows missing workspace or dates are skipped", async () => {
    mocks.findMany.mockResolvedValueOnce([
      makeCampaign({ workspace: null }),
      makeCampaign({ start_date: null }),
      makeCampaign({ end_date: "not-a-date" }),
    ]);

    const result = await runCampaignScheduleSync();

    expect(result.transitioned).toBe(0);
    expect(mocks.updateCampaignStatusInWorkspace).not.toHaveBeenCalled();
  });
});
