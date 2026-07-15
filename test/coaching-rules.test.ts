import { describe, expect, test } from "vitest";
import type { CoachingConfig } from "../app/lib/coaching-schemas";
import { createCoachingState, type CoachingState } from "../services/media-stream/coaching-state";
import {
  computeScore,
  evaluateUtterance,
  extractFillers,
} from "../services/media-stream/coaching-rules";
import type { TranscriptSegmentRow } from "../services/media-stream/db-writer";

// coaching-rules is pure by contract: no vi.mock of db-writer, no network stub,
// no billing stub anywhere in this file. If a rule ever reaches for an effect,
// this suite fails to run rather than silently passing against a mock.

const config: CoachingConfig = {
  fillerWords: ["uh", "um"],
  wpmMin: 120,
  wpmMax: 160,
  pauseThresholdMs: 1500,
  llmCadenceMs: 30_000,
  llmPersona: "coach",
  disclosureEnabled: false,
};

function state(overrides: Partial<CoachingState> = {}): CoachingState {
  return {
    ...createCoachingState({
      callSid: "CA123",
      workspaceId: "ws-1",
      direction: "outbound",
      config,
    }),
    ...overrides,
  };
}

function segment(overrides: Partial<TranscriptSegmentRow> = {}): TranscriptSegmentRow {
  return {
    id: "seg-1",
    call_sid: "CA123",
    speaker: 0,
    speaker_label: "agent",
    text: "hello there friend",
    start_ms: 0,
    end_ms: 1_000,
    confidence: 0.9,
    filler_count: 0,
    is_final: true,
    created_at: new Date().toISOString(),
    ...overrides,
  } as TranscriptSegmentRow;
}

describe("extractFillers", () => {
  test("matches configured filler words case-insensitively", () => {
    expect(extractFillers("Uh, well, UM okay", ["uh", "um"])).toEqual(["uh", "um"]);
  });

  test("returns empty when no fillers present", () => {
    expect(extractFillers("clean sentence", ["uh", "um"])).toEqual([]);
  });
});

describe("evaluateUtterance", () => {
  test("does not mutate the input state", () => {
    const before = state();
    const snapshot = structuredClone({
      segments: before.segments,
      fillerTotal: before.fillerTotal,
      pauseTotal: before.pauseTotal,
      wpmWindow: before.wpmWindow,
    });

    evaluateUtterance(before, segment({ filler_count: 4 }), 0);

    expect(before.segments).toEqual(snapshot.segments);
    expect(before.fillerTotal).toBe(snapshot.fillerTotal);
    expect(before.pauseTotal).toBe(snapshot.pauseTotal);
    expect(before.wpmWindow).toEqual(snapshot.wpmWindow);
  });

  test("raises a filler_burst cue at three or more fillers", () => {
    const { cues, next } = evaluateUtterance(state(), segment({ filler_count: 3, text: "uh um uh" }), 0);

    const filler = cues.find((cue) => cue.type === "filler_burst");
    expect(filler).toMatchObject({ severity: "warn", heading: "Filler burst" });
    expect(next.fillerTotal).toBe(3);
  });

  test("does not raise a filler_burst cue below the threshold", () => {
    const { cues } = evaluateUtterance(state(), segment({ filler_count: 2 }), 0);
    expect(cues.map((cue) => cue.type)).not.toContain("filler_burst");
  });

  test("raises a pace cue only after three consecutive out-of-range utterances", () => {
    // 3 words over 1s => 180 wpm, above wpmMax of 160.
    const fast = segment({ text: "one two three", start_ms: 0, end_ms: 1_000 });

    const first = evaluateUtterance(state(), fast, 0);
    expect(first.cues.map((cue) => cue.type)).not.toContain("pace");
    expect(first.next.outOfRangeStreak).toBe(1);

    const second = evaluateUtterance(state({ outOfRangeStreak: 1 }), fast, 0);
    expect(second.cues.map((cue) => cue.type)).not.toContain("pace");

    const third = evaluateUtterance(state({ outOfRangeStreak: 2 }), fast, 0);
    const pace = third.cues.find((cue) => cue.type === "pace");
    expect(pace).toMatchObject({ heading: "Slow down" });
    expect(third.next.outOfRangeStreak).toBe(0);
  });

  test("raises a long pause cue past twice the pause threshold", () => {
    const { cues, next } = evaluateUtterance(
      state({ lastUtteranceEndMs: 1_000 }),
      segment({ start_ms: 6_000, end_ms: 7_000 }),
      0,
    );

    const pause = cues.find((cue) => cue.type === "pause");
    expect(pause).toMatchObject({ severity: "warn", heading: "Long pause" });
    expect(next.longPauseTotal).toBe(1);
    expect(next.pauseTotal).toBe(1);
  });

  test("reports metrics including the current segment's fillers", () => {
    const { metrics } = evaluateUtterance(
      state({ fillerTotal: 2 }),
      segment({ filler_count: 1 }),
      0,
    );
    expect(metrics.fillerCount).toBe(3);
  });

  test("flags llmCueDue only once the cadence has elapsed", () => {
    const base = state({ lastCueAt: 10_000 });

    expect(evaluateUtterance(base, segment(), 20_000).llmCueDue).toBe(false);
    expect(evaluateUtterance(base, segment(), 40_000).llmCueDue).toBe(true);
    expect(evaluateUtterance(base, segment(), 40_000).next.lastCueAt).toBe(40_000);
  });
});

describe("computeScore", () => {
  test("a flawless session scores 100 — no hardcoded ceiling", () => {
    const perfect = state({
      wpmWindow: { words: 140, ms: 60_000 },
      fillerTotal: 0,
      longPauseTotal: 0,
    });
    expect(computeScore(perfect)).toBe(100);
  });

  test("a worst-case session scores below the old hardcoded floor of 15", () => {
    const worst = state({
      wpmWindow: { words: 400, ms: 60_000 },
      fillerTotal: 40,
      longPauseTotal: 20,
    });
    // pace 60 only; filler and pause both clamp to 0 => 60 * .25 / .8 = 18.75.
    expect(computeScore(worst)).toBe(19);
  });

  test("weights are renormalized over the three real signals", () => {
    const s = state({
      wpmWindow: { words: 140, ms: 60_000 },
      fillerTotal: 4,
      longPauseTotal: 2,
    });
    // pace 100, filler 80, pause 80 => (25 + 24 + 20) / 0.8 = 86.25.
    expect(computeScore(s)).toBe(86);
  });
});
