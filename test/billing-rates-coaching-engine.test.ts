import { describe, expect, test } from "vitest";
import {
  COACHING_CUE_CREDITS,
  TRANSCRIPTION_BATCH_CREDITS,
  TRANSCRIPTION_RATE_CREDITS,
} from "../shared/billing-rates";
import { computeWpm, createCoachingState } from "../services/media-stream/coaching-state";

describe("billing-rates", () => {
  test("exports stable credit constants", () => {
    expect(TRANSCRIPTION_RATE_CREDITS).toBe(0.43);
    expect(COACHING_CUE_CREDITS).toBe(0.1);
    expect(TRANSCRIPTION_BATCH_CREDITS).toBe(1);
  });
});

describe("coaching-engine", () => {
  test("createCoachingState initializes counters", () => {
    const state = createCoachingState({
      callSid: "CA123",
      workspaceId: "ws-1",
      direction: "outbound",
      config: {
        fillerWords: ["uh"],
        wpmMin: 120,
        wpmMax: 160,
        pauseThresholdMs: 1500,
        llmCadenceMs: 30_000,
        llmPersona: "coach",
        disclosureEnabled: false,
      },
    });
    expect(state.fillerTotal).toBe(0);
    expect(state.pauseTotal).toBe(0);
  });

  test("computeWpm derives words per minute from rolling window", () => {
    expect(computeWpm({ words: 150, ms: 60_000 })).toBe(150);
    expect(computeWpm({ words: 0, ms: 0 })).toBe(0);
  });
});
