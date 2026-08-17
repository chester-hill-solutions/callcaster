import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger.client";
import { subscribeToWorkspaceEventSource } from "@/lib/workspace-events-connection.client";
import {
  COACHING_EVENT_TYPES,
  safeParseCoachingEvent,
} from "@/lib/coaching-events.shared";
import {
  safeParseWorkspaceEventData,
} from "@/lib/workspace-events.shared";

export type TranscriptSegmentView = {
  id: string;
  speaker: number;
  speakerLabel: string;
  text: string;
  startMs: number;
  endMs: number;
  fillerCount: number;
};

export type CoachingMetricsView = {
  wpm: number;
  fillerCount: number;
  pauseCount: number;
  longPauseCount: number;
};

export type CoachingCueView = {
  eventId: string;
  type: string;
  severity: string;
  heading: string;
  suggestion: string;
  acknowledgedAt?: string;
};

export type CoachingSessionView = {
  wpmAvg: number;
  fillerCount: number;
  pauseCount: number;
  longPauseCount: number;
  score: number;
  summary: string;
};

/**
 * Server-rendered state for a call already in flight, from
 * `getCallCoachingHydration`. Carries its own `callSid` so a stale loader
 * payload can never be pinned onto a different call.
 */
export type CallCoachingHydration = {
  callSid: string;
  segments: TranscriptSegmentView[];
  metrics: CoachingMetricsView | null;
  cues: CoachingCueView[];
  session: CoachingSessionView | null;
};

function hydrationFor(
  callSid: string | null,
  hydration: CallCoachingHydration | null | undefined,
): CallCoachingHydration | null {
  if (!hydration || !callSid || hydration.callSid !== callSid) return null;
  return hydration;
}

/**
 * Subscribes to live transcript / coaching SSE for a call.
 *
 * `subscribe` short-circuits inside the effect rather than at the call site so
 * callers can keep calling the hook unconditionally (rules of hooks). When it
 * is false no EventSource is constructed at all — a panel that renders nothing
 * must not hold an SSE connection open.
 *
 * `hydration` seeds state for a call that was already running before this mount
 * (a reload, or panels enabled mid-call). It is read through a ref so that a
 * loader revalidation handing back a fresh object identity cannot reset live
 * state out from under the stream.
 */
export function useCallCoaching(
  workspaceId: string,
  callSid: string | null,
  subscribe: boolean = true,
  hydration?: CallCoachingHydration | null,
) {
  const seed = hydrationFor(callSid, hydration);
  const [segments, setSegments] = useState<TranscriptSegmentView[]>(
    () => seed?.segments ?? [],
  );
  const [metrics, setMetrics] = useState<CoachingMetricsView | null>(
    () => seed?.metrics ?? null,
  );
  const [cues, setCues] = useState<CoachingCueView[]>(() => seed?.cues ?? []);
  const [session, setSession] = useState<CoachingSessionView | null>(
    () => seed?.session ?? null,
  );
  const callSidRef = useRef(callSid);
  const hydrationRef = useRef(hydration);
  hydrationRef.current = hydration;
  // Seeded above via the useState initialisers; this tracks *changes* only, so
  // the reset effect does not immediately clobber the hydrated mount.
  const seededSidRef = useRef(callSid);

  /**
   * @effect Track the active call sid in a ref for the SSE listener, and reset transcript/coaching state when the screen switches to a different call (re-seeding from hydration if the new call has any).
   * @effect-deps callSid (the active call; a change means the previous call's transcript, cues, metrics and session must not leak into the new one)
   * @effect-side-effects none — updates callSidRef/seededSidRef and resets local state only
   * @effect-why-not-loader Reacts to an in-page call switch rather than a navigation; the initial values come from the loader via `hydration`, and this only handles subsequent changes.
   */
  useEffect(() => {
    callSidRef.current = callSid;
    if (seededSidRef.current === callSid) return;
    seededSidRef.current = callSid;

    const next = hydrationFor(callSid, hydrationRef.current);
    setSegments(next?.segments ?? []);
    setMetrics(next?.metrics ?? null);
    setCues(next?.cues ?? []);
    setSession(next?.session ?? null);
  }, [callSid]);

  /**
   * @effect Open an SSE connection to the workspace events endpoint and apply this call's transcript segments, coaching metrics, cues and final session to local state.
   * @effect-deps workspaceId (which workspace's event stream to open); callSid (which call's events to keep — others are discarded); subscribe (capability gate; false means no connection is opened at all)
   * @effect-side-effects subscription — opens an EventSource (SSE) connection on mount/dep-change; removes listeners and closes the connection on cleanup, or on a terminal access_revoked frame
   * @effect-why-not-loader Live server-pushed transcript/coaching events cannot be modeled as request/response; the connection stays open for the call's duration. Initial state is loader-provided via `hydration`.
   */
  useEffect(() => {
    if (!subscribe || !workspaceId || !callSid) return;

    const url = `/api/workspaces/${encodeURIComponent(workspaceId)}/events`;
    const handleWorkspaceEvent = (message: MessageEvent<string>) => {
      const record = safeParseWorkspaceEventData(message.data);
      if (!record) {
        logger.error("Discarded malformed workspace event frame");
        return;
      }

      const parsed = safeParseCoachingEvent(record.event_type, record.payload);
      if (!parsed.ok) {
        // Non-coaching events share this stream; only shout about our own.
        if (!parsed.unknownType) {
          logger.error(
            `Discarded invalid ${record.event_type} event: ${parsed.error}`,
          );
        }
        return;
      }

      const { type, payload } = parsed.event;
      if (payload.callSid !== callSidRef.current) return;

      switch (type) {
        case COACHING_EVENT_TYPES.transcriptSegment:
          setSegments((prev) =>
            // Hydration and SSE replay overlap: a reconnect with no
            // Last-Event-ID re-delivers segments we already have.
            prev.some((existing) => existing.id === payload.segmentId)
              ? prev
              : [
                  ...prev,
                  {
                    id: payload.segmentId,
                    speaker: payload.speaker,
                    speakerLabel: payload.speakerLabel,
                    text: payload.text,
                    startMs: payload.startMs,
                    endMs: payload.endMs,
                    fillerCount: payload.fillerCount,
                  },
                ],
          );
          break;
        case COACHING_EVENT_TYPES.coachingMetrics:
          setMetrics({
            wpm: payload.wpm,
            fillerCount: payload.fillerCount,
            pauseCount: payload.pauseCount,
            longPauseCount: payload.longPauseCount,
          });
          break;
        case COACHING_EVENT_TYPES.coachingCue:
          setCues((prev) =>
            // Keeping the existing entry also preserves a hydrated
            // acknowledgedAt that the replayed event does not carry.
            prev.some((existing) => existing.eventId === payload.eventId)
              ? prev
              : [
                  ...prev,
                  {
                    eventId: payload.eventId,
                    type: payload.type,
                    severity: payload.severity,
                    heading: payload.heading,
                    suggestion: payload.suggestion,
                    acknowledgedAt: payload.acknowledgedAt,
                  },
                ],
          );
          break;
        case COACHING_EVENT_TYPES.coachingSessionFinal:
          setSession({
            wpmAvg: payload.wpmAvg,
            fillerCount: payload.fillerCount,
            pauseCount: payload.pauseCount,
            longPauseCount: payload.longPauseCount,
            score: payload.score,
            summary: payload.summary,
          });
          break;
      }
    };

    // Shares the page-wide workspace EventSource instead of opening another
    // one mid-call (see workspace-events-connection.client.ts). Revocation
    // closes the shared connection there; live transcript state stays as-is
    // rather than being cleared — the call screen is about to be navigated
    // away from anyway, and blanking it mid-call would look like a
    // transcription failure.
    return subscribeToWorkspaceEventSource(url, handleWorkspaceEvent);
  }, [workspaceId, callSid, subscribe]);

  const acknowledgeCue = useCallback(
    async (eventId: string) => {
      const stamp = (acknowledgedAt: string | undefined) =>
        setCues((prev) =>
          prev.map((cue) =>
            cue.eventId === eventId ? { ...cue, acknowledgedAt } : cue,
          ),
        );

      // Optimistic, then reverted if the server disagrees — a 403/404 must not
      // leave a cue looking acknowledged when nothing was written.
      stamp(new Date().toISOString());
      try {
        // `workspaceId` lets the server gate on tenant-scoped call ownership
        // before it reads or writes the cue; it is validated against the
        // caller's membership server-side, never trusted as-is.
        const response = await fetch("/api/coaching-ack", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ coachingEventId: eventId, workspaceId }),
        });
        if (!response.ok) {
          throw new Error(`Acknowledge failed with status ${response.status}`);
        }
      } catch (error) {
        stamp(undefined);
        logger.error("Failed to acknowledge coaching cue", error);
        toast.error("Could not acknowledge that cue. Please try again.");
      }
    },
    [workspaceId],
  );

  return { segments, metrics, cues, session, acknowledgeCue };
}
