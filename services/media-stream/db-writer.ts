import { transcript_segment, coaching_event, coaching_session } from "@/db/schema-transcription";
import {
  COACHING_EVENT_TYPES,
  CoachingCueEventPayload,
  CoachingMetricsEventPayload,
  CoachingSessionFinalEventPayload,
  TranscriptSegmentEventPayload,
} from "@/lib/coaching-events.shared";
import { insertWorkspaceEvent } from "@/lib/workspace-events.server";
import { adminDb } from "@/server/admin-db";

export type TranscriptSegmentInsert = typeof transcript_segment.$inferInsert;
export type TranscriptSegmentRow = typeof transcript_segment.$inferSelect;
export type CoachingEventInsert = typeof coaching_event.$inferInsert;
export type CoachingEventRow = typeof coaching_event.$inferSelect;
export type CoachingSessionInsert = typeof coaching_session.$inferInsert;
export type CoachingSessionRow = typeof coaching_session.$inferSelect;

export async function writeTranscriptSegment(
  segment: TranscriptSegmentInsert,
): Promise<TranscriptSegmentRow> {
  const [row] = await adminDb.insert(transcript_segment).values(segment).returning();
  if (!row) {
    throw new Error("Failed to insert transcript segment");
  }
  return row;
}

export async function writeCoachingEvent(
  event: CoachingEventInsert,
): Promise<CoachingEventRow> {
  const [row] = await adminDb.insert(coaching_event).values(event).returning();
  if (!row) {
    throw new Error("Failed to insert coaching event");
  }
  return row;
}

export async function writeCoachingSessionFinal(
  session: CoachingSessionInsert,
): Promise<CoachingSessionRow> {
  const [row] = await adminDb
    .insert(coaching_session)
    .values(session)
    .onConflictDoUpdate({
      target: coaching_session.call_sid,
      set: session,
    })
    .returning();
  if (!row) {
    throw new Error("Failed to upsert coaching session");
  }
  return row;
}

export async function publishTranscriptSegmentEvent(
  workspaceId: string,
  callSid: string,
  segment: TranscriptSegmentRow,
): Promise<void> {
  const payload = TranscriptSegmentEventPayload.parse({
    callSid,
    segmentId: segment.id,
    speaker: segment.speaker,
    speakerLabel: segment.speaker_label,
    text: segment.text,
    startMs: segment.start_ms,
    endMs: segment.end_ms,
    fillerCount: segment.filler_count,
  });
  await insertWorkspaceEvent(workspaceId, COACHING_EVENT_TYPES.transcriptSegment, payload);
}

export async function publishCoachingMetricsEvent(
  workspaceId: string,
  callSid: string,
  metrics: {
    wpm: number;
    fillerCount: number;
    pauseCount: number;
    longPauseCount: number;
  },
): Promise<void> {
  const payload = CoachingMetricsEventPayload.parse({ callSid, ...metrics });
  await insertWorkspaceEvent(workspaceId, COACHING_EVENT_TYPES.coachingMetrics, payload);
}

export async function publishCoachingCueEvent(
  workspaceId: string,
  callSid: string,
  cue: {
    eventId: string;
    type: string;
    severity: string;
    heading: string;
    suggestion: string;
  },
): Promise<void> {
  const payload = CoachingCueEventPayload.parse({ callSid, ...cue });
  await insertWorkspaceEvent(workspaceId, COACHING_EVENT_TYPES.coachingCue, payload);
}

export async function publishCoachingSessionFinalEvent(
  workspaceId: string,
  callSid: string,
  session: {
    sessionId: string;
    wpmAvg: number;
    fillerCount: number;
    pauseCount: number;
    longPauseCount: number;
    score: number;
    summary: string;
  },
): Promise<void> {
  const payload = CoachingSessionFinalEventPayload.parse({ callSid, ...session });
  await insertWorkspaceEvent(workspaceId, COACHING_EVENT_TYPES.coachingSessionFinal, payload);
}
