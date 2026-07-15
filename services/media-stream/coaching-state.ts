import type { CoachingConfig } from "@/lib/coaching-schemas";
import type { TranscriptSegmentRow } from "./db-writer";

export type CoachingState = {
  callSid: string;
  workspaceId: string;
  direction: string;
  startTime: number;
  config: CoachingConfig;
  segments: TranscriptSegmentRow[];
  wpmWindow: { words: number; ms: number };
  fillerTotal: number;
  pauseTotal: number;
  longPauseTotal: number;
  lastUtteranceEndMs: number;
  lastCueAt: number;
  outOfRangeStreak: number;
};

export function createCoachingState(args: {
  callSid: string;
  workspaceId: string;
  direction: string;
  config: CoachingConfig;
}): CoachingState {
  return {
    callSid: args.callSid,
    workspaceId: args.workspaceId,
    direction: args.direction,
    startTime: Date.now(),
    config: args.config,
    segments: [],
    wpmWindow: { words: 0, ms: 0 },
    fillerTotal: 0,
    pauseTotal: 0,
    longPauseTotal: 0,
    lastUtteranceEndMs: 0,
    lastCueAt: 0,
    outOfRangeStreak: 0,
  };
}

export function computeWpm(window: { words: number; ms: number }): number {
  if (window.ms <= 0) return 0;
  return Math.round((window.words / window.ms) * 60_000);
}
