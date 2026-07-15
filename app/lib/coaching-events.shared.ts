/**
 * Single source of truth for the live transcript / coaching workspace events
 * (ADR-0027/0028).
 *
 * Both ends of the wire import this module:
 *  - `services/media-stream/db-writer.ts` parses payloads on the way OUT, so a
 *    malformed producer is a loud failure at the publish site rather than a
 *    silently-dropped event in every browser.
 *  - `app/hooks/call/useCallCoaching.ts` safe-parses on the way IN, so a bad or
 *    hostile row can never corrupt UI state.
 *
 * Client-safe: zod only, no server imports. `app/db/schema-transcription.ts`
 * already establishes that `@/lib/*` schema modules are importable from
 * `services/media-stream`, so this module is reachable from both trees.
 */
import { z } from "zod";

/**
 * The four event-type literals. Previously duplicated as bare strings between
 * db-writer.ts and useCallCoaching.ts; import from here instead.
 */
export const COACHING_EVENT_TYPES = {
  transcriptSegment: "transcript_segment",
  coachingMetrics: "coaching_metrics",
  coachingCue: "coaching_cue",
  coachingSessionFinal: "coaching_session_final",
} as const;

/** `speaker_label` is nullable in `transcript_segment`; normalise it here once. */
const speakerLabel = z
  .string()
  .nullish()
  .transform((value) => value ?? "speaker");

const nullableCount = z
  .number()
  .nullish()
  .transform((value) => value ?? 0);

export const TranscriptSegmentEventPayload = z.object({
  callSid: z.string().min(1),
  segmentId: z.string().min(1),
  speaker: z.number(),
  speakerLabel,
  text: z.string(),
  startMs: z.number(),
  endMs: z.number(),
  fillerCount: nullableCount,
});
export type TranscriptSegmentEventPayload = z.infer<typeof TranscriptSegmentEventPayload>;

export const CoachingMetricsEventPayload = z.object({
  callSid: z.string().min(1),
  wpm: z.number(),
  fillerCount: z.number(),
  pauseCount: z.number(),
  longPauseCount: z.number(),
});
export type CoachingMetricsEventPayload = z.infer<typeof CoachingMetricsEventPayload>;

export const CoachingCueEventPayload = z.object({
  callSid: z.string().min(1),
  eventId: z.string().min(1),
  type: z.string().min(1),
  severity: z
    .string()
    .nullish()
    .transform((value) => value ?? "info"),
  heading: z.string(),
  suggestion: z.string(),
  /** Present on hydrated cues; live cues are always unacknowledged. */
  acknowledgedAt: z.string().nullish().transform((value) => value ?? undefined),
});
export type CoachingCueEventPayload = z.infer<typeof CoachingCueEventPayload>;

export const CoachingSessionFinalEventPayload = z.object({
  callSid: z.string().min(1),
  sessionId: z.string().min(1),
  wpmAvg: nullableCount,
  fillerCount: nullableCount,
  pauseCount: nullableCount,
  longPauseCount: nullableCount,
  score: nullableCount,
  summary: z
    .string()
    .nullish()
    .transform((value) => value ?? ""),
});
export type CoachingSessionFinalEventPayload = z.infer<typeof CoachingSessionFinalEventPayload>;

export const COACHING_EVENT_PAYLOAD_SCHEMAS = {
  [COACHING_EVENT_TYPES.transcriptSegment]: TranscriptSegmentEventPayload,
  [COACHING_EVENT_TYPES.coachingMetrics]: CoachingMetricsEventPayload,
  [COACHING_EVENT_TYPES.coachingCue]: CoachingCueEventPayload,
  [COACHING_EVENT_TYPES.coachingSessionFinal]: CoachingSessionFinalEventPayload,
} as const;

export type CoachingEventType = keyof typeof COACHING_EVENT_PAYLOAD_SCHEMAS;

export type CoachingEvent =
  | { type: typeof COACHING_EVENT_TYPES.transcriptSegment; payload: TranscriptSegmentEventPayload }
  | { type: typeof COACHING_EVENT_TYPES.coachingMetrics; payload: CoachingMetricsEventPayload }
  | { type: typeof COACHING_EVENT_TYPES.coachingCue; payload: CoachingCueEventPayload }
  | {
      type: typeof COACHING_EVENT_TYPES.coachingSessionFinal;
      payload: CoachingSessionFinalEventPayload;
    };

export function isCoachingEventType(eventType: string): eventType is CoachingEventType {
  return Object.prototype.hasOwnProperty.call(COACHING_EVENT_PAYLOAD_SCHEMAS, eventType);
}

export type CoachingEventParseResult =
  | { ok: true; event: CoachingEvent }
  /** `unknownType` distinguishes "not ours, ignore quietly" from "ours but malformed". */
  | { ok: false; unknownType: true }
  | { ok: false; unknownType: false; error: string };

/**
 * Validate one workspace-event envelope. Never throws — the SSE handler must not
 * be able to tear down the stream on a single bad row.
 */
export function safeParseCoachingEvent(
  eventType: string,
  payload: unknown,
): CoachingEventParseResult {
  if (!isCoachingEventType(eventType)) {
    return { ok: false, unknownType: true };
  }

  const schema = COACHING_EVENT_PAYLOAD_SCHEMAS[eventType];
  const result = schema.safeParse(payload);
  if (!result.success) {
    return {
      ok: false,
      unknownType: false,
      error: result.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; "),
    };
  }

  return { ok: true, event: { type: eventType, payload: result.data } as CoachingEvent };
}
