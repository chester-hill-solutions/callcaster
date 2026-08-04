/**
 * Initial transcript / coaching state for a call that is already in flight.
 *
 * Without this, a reload or a late mount of the coaching panels starts from an
 * empty UI even though `transcript_segment` / `coaching_event` /
 * `coaching_session` rows already exist for the call. The SSE stream is a
 * *delta* transport, not a hydration transport: a fresh EventSource has no
 * `Last-Event-ID`, so relying on replay would stream the workspace's entire
 * event history from id 0 just to reconstruct one call.
 *
 * Tenancy: `transcript_segment` / `coaching_event` / `coaching_session` carry no
 * workspace column, so they are not in `workspace-scoped-tables.ts` and the
 * scoped client cannot filter them. We therefore gate on `call` — which *is*
 * scoped — via `createTenantDb`, and only touch the transcription tables once
 * the call is proven to belong to this workspace. A call in another workspace
 * yields `null`, matching the repo's uniform-404 posture (ADR-0004).
 */
import { desc, eq } from "drizzle-orm";
import { call as callTable } from "@/db/schema";
import {
  coaching_event,
  coaching_session,
  transcript_segment,
} from "@/db/schema-transcription";
import { createTenantDb } from "@/server/tenant-db";
import { adminDb } from "@/server/admin-db";

/** Bounds. A long call can accumulate thousands of segments; hydrate a tail. */
export const HYDRATION_SEGMENT_LIMIT = 200;
export const HYDRATION_CUE_LIMIT = 50;

export type CallCoachingHydration = {
  callSid: string;
  segments: Array<{
    id: string;
    speaker: number;
    speakerLabel: string;
    text: string;
    startMs: number;
    endMs: number;
    fillerCount: number;
  }>;
  metrics: null;
  cues: Array<{
    eventId: string;
    type: string;
    severity: string;
    heading: string;
    suggestion: string;
    acknowledgedAt?: string;
  }>;
  session: {
    wpmAvg: number;
    fillerCount: number;
    pauseCount: number;
    longPauseCount: number;
    score: number;
    summary: string;
  } | null;
};

export async function getCallCoachingHydration(
  workspaceId: string,
  callSid: string | null | undefined,
): Promise<CallCoachingHydration | null> {
  if (!callSid) return null;

  // Tenancy gate: the scoped client filters `call` by workspace for us.
  const tdb = createTenantDb(workspaceId);
  const owned = await tdb.call.findFirst({
    where: eq(callTable.sid, callSid),
    columns: { sid: true },
  });
  if (!owned) return null;

  const [segmentRows, cueRows, sessionRow] = await Promise.all([
    adminDb.query.transcript_segment.findMany({
      where: eq(transcript_segment.call_sid, callSid),
      orderBy: [desc(transcript_segment.start_ms)],
      limit: HYDRATION_SEGMENT_LIMIT,
    }),
    adminDb.query.coaching_event.findMany({
      where: eq(coaching_event.call_sid, callSid),
      orderBy: [desc(coaching_event.created_at)],
      limit: HYDRATION_CUE_LIMIT,
    }),
    adminDb.query.coaching_session.findFirst({
      where: eq(coaching_session.call_sid, callSid),
    }),
  ]);

  return {
    callSid,
    // Queried newest-first to bound the tail, rendered oldest-first.
    segments: [...segmentRows].reverse().map((row) => ({
      id: row.id,
      speaker: row.speaker,
      speakerLabel: row.speaker_label ?? "speaker",
      text: row.text,
      startMs: row.start_ms,
      endMs: row.end_ms,
      fillerCount: row.filler_count ?? 0,
    })),
    // `coaching_metrics` is a computed, cadence-published event with no table
    // behind it, so there is nothing to hydrate; the next engine tick fills it.
    metrics: null,
    cues: [...cueRows].reverse().map((row) => ({
      eventId: row.id,
      type: row.type,
      severity: row.severity ?? "info",
      heading: String(row.payload?.heading ?? row.type),
      suggestion: String(row.payload?.suggestion ?? ""),
      acknowledgedAt: row.acknowledged_at ?? undefined,
    })),
    session: sessionRow
      ? {
          wpmAvg: sessionRow.wpm_avg ?? 0,
          fillerCount: sessionRow.filler_count ?? 0,
          pauseCount: sessionRow.pause_count ?? 0,
          longPauseCount: sessionRow.long_pause_count ?? 0,
          score: sessionRow.score ?? 0,
          summary: sessionRow.summary ?? "",
        }
      : null,
  };
}
