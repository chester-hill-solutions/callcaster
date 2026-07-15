/**
 * End-of-session coaching work: summary, final metrics, persistence, publish.
 *
 * Note what is NOT here: the live-transcription debit. That charge follows the
 * STT lifecycle and is raised by the twilio-handler on stream stop, so that
 * transcription-only workspaces (which never build a coaching state) are still
 * billed. See `coaching-billing.ts`.
 */
import { computeWpm } from "./coaching-state";
import type { CoachingState } from "./coaching-state";
import { generateCallSummary } from "./coaching-llm";
import { computeScore } from "./coaching-rules";
import {
  publishCoachingSessionFinalEvent,
  writeCoachingSessionFinal,
} from "./db-writer";

export async function finalizeCoachingSession(
  state: CoachingState,
): Promise<void> {
  const wpmAvg = computeWpm(state.wpmWindow);
  const summary = await generateCallSummary(state);
  const score = computeScore(state);

  const session = await writeCoachingSessionFinal({
    call_sid: state.callSid,
    wpm_avg: wpmAvg,
    filler_count: state.fillerTotal,
    pause_count: state.pauseTotal,
    long_pause_count: state.longPauseTotal,
    score,
    summary: summary || null,
  });

  await publishCoachingSessionFinalEvent(state.workspaceId, state.callSid, {
    sessionId: session.id,
    wpmAvg,
    fillerCount: state.fillerTotal,
    pauseCount: state.pauseTotal,
    longPauseCount: state.longPauseTotal,
    score,
    summary,
  });
}
