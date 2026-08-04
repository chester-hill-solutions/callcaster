import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  createTenantDb: vi.fn(),
  callFindFirst: vi.fn(),
  segmentFindMany: vi.fn(),
  cueFindMany: vi.fn(),
  sessionFindFirst: vi.fn(),
}));

vi.mock("@/server/tenant-db", () => ({
  createTenantDb: mocks.createTenantDb,
}));

vi.mock("@/server/admin-db", () => ({
  adminDb: {
    query: {
      transcript_segment: { findMany: mocks.segmentFindMany },
      coaching_event: { findMany: mocks.cueFindMany },
      coaching_session: { findFirst: mocks.sessionFindFirst },
    },
  },
}));

const { getCallCoachingHydration, HYDRATION_SEGMENT_LIMIT, HYDRATION_CUE_LIMIT } =
  await import("@/lib/call-coaching-hydration.server");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createTenantDb.mockReturnValue({ call: { findFirst: mocks.callFindFirst } });
  mocks.callFindFirst.mockResolvedValue({ sid: "CA123" });
  mocks.segmentFindMany.mockResolvedValue([]);
  mocks.cueFindMany.mockResolvedValue([]);
  mocks.sessionFindFirst.mockResolvedValue(undefined);
});

describe("getCallCoachingHydration", () => {
  test("returns null without a callSid and touches no table", async () => {
    await expect(getCallCoachingHydration("ws-1", null)).resolves.toBeNull();
    await expect(getCallCoachingHydration("ws-1", undefined)).resolves.toBeNull();
    expect(mocks.createTenantDb).not.toHaveBeenCalled();
    expect(mocks.segmentFindMany).not.toHaveBeenCalled();
  });

  test("scopes the tenancy gate through createTenantDb for this workspace", async () => {
    await getCallCoachingHydration("ws-1", "CA123");
    expect(mocks.createTenantDb).toHaveBeenCalledWith("ws-1");
  });

  test("returns null and reads no transcript rows when the call is not in the workspace", async () => {
    // The scoped `call` client filters by workspace, so a foreign sid misses.
    mocks.callFindFirst.mockResolvedValue(undefined);

    await expect(getCallCoachingHydration("ws-1", "CA-other")).resolves.toBeNull();
    expect(mocks.segmentFindMany).not.toHaveBeenCalled();
    expect(mocks.cueFindMany).not.toHaveBeenCalled();
    expect(mocks.sessionFindFirst).not.toHaveBeenCalled();
  });

  test("bounds both list queries rather than fetching unbounded history", async () => {
    await getCallCoachingHydration("ws-1", "CA123");

    expect(mocks.segmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: HYDRATION_SEGMENT_LIMIT }),
    );
    expect(mocks.cueFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: HYDRATION_CUE_LIMIT }),
    );
    expect(HYDRATION_SEGMENT_LIMIT).toBeLessThanOrEqual(200);
  });

  test("maps rows to view shape and restores chronological order", async () => {
    // Queried newest-first to bound the tail; the UI needs oldest-first.
    mocks.segmentFindMany.mockResolvedValue([
      {
        id: "seg-2",
        speaker: 1,
        speaker_label: "contact",
        text: "second",
        start_ms: 500,
        end_ms: 900,
        filler_count: 2,
      },
      {
        id: "seg-1",
        speaker: 0,
        speaker_label: null,
        text: "first",
        start_ms: 0,
        end_ms: 400,
        filler_count: null,
      },
    ]);

    const result = await getCallCoachingHydration("ws-1", "CA123");

    expect(result?.callSid).toBe("CA123");
    expect(result?.segments).toEqual([
      {
        id: "seg-1",
        speaker: 0,
        speakerLabel: "speaker",
        text: "first",
        startMs: 0,
        endMs: 400,
        fillerCount: 0,
      },
      {
        id: "seg-2",
        speaker: 1,
        speakerLabel: "contact",
        text: "second",
        startMs: 500,
        endMs: 900,
        fillerCount: 2,
      },
    ]);
  });

  test("derives cue heading/suggestion from the jsonb payload", async () => {
    mocks.cueFindMany.mockResolvedValue([
      {
        id: "evt-1",
        type: "pace",
        severity: "warn",
        payload: { heading: "Slow down", suggestion: "Breathe." },
        acknowledged_at: "2026-07-15T00:00:00Z",
      },
    ]);

    const result = await getCallCoachingHydration("ws-1", "CA123");

    expect(result?.cues).toEqual([
      {
        eventId: "evt-1",
        type: "pace",
        severity: "warn",
        heading: "Slow down",
        suggestion: "Breathe.",
        acknowledgedAt: "2026-07-15T00:00:00Z",
      },
    ]);
  });

  test("falls back to the cue type when the payload has no heading", async () => {
    mocks.cueFindMany.mockResolvedValue([
      { id: "evt-1", type: "filler", severity: null, payload: null, acknowledged_at: null },
    ]);

    const result = await getCallCoachingHydration("ws-1", "CA123");

    expect(result?.cues[0]).toEqual({
      eventId: "evt-1",
      type: "filler",
      severity: "info",
      heading: "filler",
      suggestion: "",
      acknowledgedAt: undefined,
    });
  });

  test("maps a finalised coaching session", async () => {
    mocks.sessionFindFirst.mockResolvedValue({
      wpm_avg: 140,
      filler_count: 3,
      pause_count: 4,
      long_pause_count: 1,
      score: 82,
      summary: "Solid.",
    });

    const result = await getCallCoachingHydration("ws-1", "CA123");

    expect(result?.session).toEqual({
      wpmAvg: 140,
      fillerCount: 3,
      pauseCount: 4,
      longPauseCount: 1,
      score: 82,
      summary: "Solid.",
    });
  });

  test("coerces a session row of all-null metric columns to zeroes", async () => {
    mocks.sessionFindFirst.mockResolvedValue({
      wpm_avg: null,
      filler_count: null,
      pause_count: null,
      long_pause_count: null,
      score: null,
      summary: null,
    });

    const result = await getCallCoachingHydration("ws-1", "CA123");
    expect(result?.session).toEqual({
      wpmAvg: 0,
      fillerCount: 0,
      pauseCount: 0,
      longPauseCount: 0,
      score: 0,
      summary: "",
    });
  });

  test("returns an empty-but-present hydration for a call with no transcript yet", async () => {
    const result = await getCallCoachingHydration("ws-1", "CA123");
    expect(result).toEqual({
      callSid: "CA123",
      segments: [],
      metrics: null,
      cues: [],
      session: null,
    });
  });
});
