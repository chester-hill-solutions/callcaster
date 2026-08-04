/**
 * Coaching engine facade — orchestration only.
 *
 * The engine is split so each concern is independently testable:
 * - `coaching-rules.ts`    pure rules: utterance + state -> cue intents + metrics
 * - `coaching-llm.ts`      Cohere generate + parse + validate (all failures non-fatal)
 * - `coaching-billing.ts`  cue + live-transcription debits
 * - `coaching-finalize.ts` summary, final metrics, persistence, publish
 *
 * This module is the only place the four meet: it takes the intents the rules
 * produce and performs their effects. It should stay thin.
 */
import { billCoachingCue } from "./coaching-billing";
import { generateLlmCue } from "./coaching-llm";
import { evaluateUtterance, type CueIntent } from "./coaching-rules";
import type { CoachingState } from "./coaching-state";
import type { TranscriptSegmentRow } from "./db-writer";
import {
  publishCoachingCueEvent,
  publishCoachingMetricsEvent,
  writeCoachingEvent,
} from "./db-writer";

export { createCoachingState, type CoachingState } from "./coaching-state";
export { finalizeCoachingSession } from "./coaching-finalize";
export { computeScore, type CueIntent } from "./coaching-rules";

/**
 * Persist a cue, publish it to the workspace, and bill it if it is LLM-generated.
 * Rule-based cues cost nothing to produce and are not billed.
 */
async function emitCue(state: CoachingState, cue: CueIntent): Promise<void> {
  const row = await writeCoachingEvent({
    call_sid: state.callSid,
    type: cue.type,
    severity: cue.severity,
    payload: cue.payload,
  });

  await publishCoachingCueEvent(state.workspaceId, state.callSid, {
    eventId: row.id,
    type: cue.type,
    severity: cue.severity,
    heading: cue.heading,
    suggestion: cue.suggestion,
  });

  if (cue.type === "suggestion") {
    await billCoachingCue({
      workspaceId: state.workspaceId,
      callSid: state.callSid,
      eventId: row.id,
    });
  }
}

/**
 * Fold one committed utterance into the session.
 *
 * Mutates `state` in place because the caller holds it on the socket; the rules
 * themselves are pure and return the next state, which is copied back here.
 */
export async function processUtterance(
  state: CoachingState,
  segment: TranscriptSegmentRow,
): Promise<void> {
  const { next, cues, metrics, llmCueDue } = evaluateUtterance(
    state,
    segment,
    Date.now(),
  );
  Object.assign(state, next);

  for (const cue of cues) {
    await emitCue(state, cue);
  }

  await publishCoachingMetricsEvent(state.workspaceId, state.callSid, metrics);

  if (llmCueDue) {
    const llmCue = await generateLlmCue(state);
    if (llmCue) {
      await emitCue(state, llmCue);
    }
  }
}
