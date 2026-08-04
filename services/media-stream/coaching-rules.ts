/**
 * Pure coaching rules. Utterance + state in, cue intents + metric snapshot out.
 *
 * This module MUST stay free of DB, network, billing and clock access — it is
 * the only part of the coaching engine that is testable without mocks, and that
 * property is the point of the split. Effects belong to the caller
 * (`coaching-engine.ts`), which turns the returned intents into writes.
 */
import { computeWpm, type CoachingState } from "./coaching-state";
import type { TranscriptSegmentRow } from "./db-writer";

/** A cue the rules decided to raise. Persisting/publishing it is the caller's job. */
export type CueIntent = {
  type: "filler_burst" | "pace" | "pause" | "suggestion";
  severity: "info" | "warn";
  payload: Record<string, unknown>;
  heading: string;
  suggestion: string;
};

export type MetricsSnapshot = {
  wpm: number;
  fillerCount: number;
  pauseCount: number;
  longPauseCount: number;
};

export type UtteranceEvaluation = {
  /** Next state. The input state is not mutated. */
  next: CoachingState;
  cues: CueIntent[];
  metrics: MetricsSnapshot;
  /** True when the LLM cadence has elapsed and the caller should ask for an LLM cue. */
  llmCueDue: boolean;
};

const WPM_WINDOW_MS = 30_000;
const WPM_WINDOW_DECAY = 0.75;
const FILLER_BURST_THRESHOLD = 3;
const OUT_OF_RANGE_STREAK_THRESHOLD = 3;

export function extractFillers(text: string, fillerWords: string[]): string[] {
  const lower = text.toLowerCase();
  return fillerWords
    .map((word) => word.toLowerCase())
    .filter((filler) => lower.includes(filler));
}

function advanceWpmWindow(
  window: { words: number; ms: number },
  segment: TranscriptSegmentRow,
): { words: number; ms: number } {
  let ms = window.ms + (segment.end_ms - segment.start_ms);
  let words = window.words + segment.text.split(/\s+/).filter(Boolean).length;

  while (ms > WPM_WINDOW_MS) {
    ms = Math.floor(ms * WPM_WINDOW_DECAY);
    words = Math.floor(words * WPM_WINDOW_DECAY);
  }

  return { words, ms };
}

/**
 * Evaluate one committed utterance against the rule set.
 *
 * @param now - injected clock reading, so the cadence decision stays pure.
 */
export function evaluateUtterance(
  state: CoachingState,
  segment: TranscriptSegmentRow,
  now: number,
): UtteranceEvaluation {
  const config = state.config;
  const cues: CueIntent[] = [];

  const wpmWindow = advanceWpmWindow(state.wpmWindow, segment);
  const wpm = computeWpm(wpmWindow);

  const fillerCount = segment.filler_count ?? 0;
  if (fillerCount >= FILLER_BURST_THRESHOLD) {
    cues.push({
      type: "filler_burst",
      severity: "warn",
      payload: {
        count: fillerCount,
        words: extractFillers(segment.text, config.fillerWords),
      },
      heading: "Filler burst",
      suggestion: "Pause briefly instead of filling silence with filler words.",
    });
  }

  let outOfRangeStreak = state.outOfRangeStreak;
  if (wpm > 0 && (wpm < config.wpmMin || wpm > config.wpmMax)) {
    outOfRangeStreak += 1;
    if (outOfRangeStreak >= OUT_OF_RANGE_STREAK_THRESHOLD) {
      const slow = wpm < config.wpmMin;
      cues.push({
        type: "pace",
        severity: "info",
        payload: { wpm, range: slow ? "slow" : "fast" },
        heading: slow ? "Pace up" : "Slow down",
        suggestion: slow
          ? "Try speaking a little faster to keep momentum."
          : "Take a breath and slow your pace for clarity.",
      });
      outOfRangeStreak = 0;
    }
  } else {
    outOfRangeStreak = 0;
  }

  let pauseTotal = state.pauseTotal;
  let longPauseTotal = state.longPauseTotal;
  if (state.lastUtteranceEndMs > 0) {
    const gapMs = segment.start_ms - state.lastUtteranceEndMs;
    if (gapMs > config.pauseThresholdMs) {
      const isLong = gapMs > config.pauseThresholdMs * 2;
      pauseTotal += 1;
      longPauseTotal += isLong ? 1 : 0;
      cues.push({
        type: "pause",
        severity: isLong ? "warn" : "info",
        payload: { durationMs: gapMs, position: "between_utterances" },
        heading: isLong ? "Long pause" : "Pause",
        suggestion: isLong
          ? "Long silence detected — acknowledge it or ask an open question."
          : "Brief pause — good moment to listen.",
      });
    }
  }

  const metrics: MetricsSnapshot = {
    wpm,
    fillerCount: state.fillerTotal + fillerCount,
    pauseCount: pauseTotal,
    longPauseCount: longPauseTotal,
  };

  const llmCueDue = now - state.lastCueAt >= config.llmCadenceMs;

  const next: CoachingState = {
    ...state,
    segments: [...state.segments, segment],
    wpmWindow,
    fillerTotal: state.fillerTotal + fillerCount,
    pauseTotal,
    longPauseTotal,
    lastUtteranceEndMs: segment.end_ms,
    lastCueAt: llmCueDue ? now : state.lastCueAt,
    outOfRangeStreak,
  };

  return { next, cues, metrics, llmCueDue };
}

/**
 * Session score, 0–100, over the three signals the engine actually measures.
 *
 * The previous formula added a hardcoded `75 * 0.2` term standing in for a
 * signal that was never implemented. That constant was not a rule, it was a
 * bias: it floored every score at 15 and capped a flawless call at 85. Rather
 * than invent a fourth signal to justify it, the term is removed and the three
 * real weights (pace .25 / filler .30 / pause .25) are renormalized over their
 * own sum, so the score spans the full range and reflects only measured input.
 */
export function computeScore(state: CoachingState): number {
  const wpm = computeWpm(state.wpmWindow);
  const paceScore =
    wpm >= state.config.wpmMin && wpm <= state.config.wpmMax ? 100 : 60;
  const fillerScore = Math.max(0, 100 - state.fillerTotal * 5);
  const pauseScore = Math.max(0, 100 - state.longPauseTotal * 10);

  const PACE_WEIGHT = 0.25;
  const FILLER_WEIGHT = 0.3;
  const PAUSE_WEIGHT = 0.25;
  const totalWeight = PACE_WEIGHT + FILLER_WEIGHT + PAUSE_WEIGHT;

  return Math.round(
    (paceScore * PACE_WEIGHT + fillerScore * FILLER_WEIGHT + pauseScore * PAUSE_WEIGHT) /
      totalWeight,
  );
}
