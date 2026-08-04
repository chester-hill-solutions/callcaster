import { describe, expect, test } from "vitest";
import {
  COACHING_EVENT_TYPES,
  CoachingCueEventPayload,
  CoachingMetricsEventPayload,
  isCoachingEventType,
  safeParseCoachingEvent,
  TranscriptSegmentEventPayload,
} from "@/lib/coaching-events.shared";

describe("coaching event type literals", () => {
  test("exports the four wire literals as a single source of truth", () => {
    expect(Object.values(COACHING_EVENT_TYPES)).toEqual([
      "transcript_segment",
      "coaching_metrics",
      "coaching_cue",
      "coaching_session_final",
    ]);
  });

  test("isCoachingEventType narrows only known types", () => {
    expect(isCoachingEventType("coaching_cue")).toBe(true);
    expect(isCoachingEventType("postgres_change")).toBe(false);
  });
});

describe("safeParseCoachingEvent — success", () => {
  test("parses a transcript_segment payload", () => {
    const result = safeParseCoachingEvent("transcript_segment", {
      callSid: "CA1",
      segmentId: "seg-1",
      speaker: 0,
      speakerLabel: "agent",
      text: "hello there",
      startMs: 100,
      endMs: 900,
      fillerCount: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.type).toBe("transcript_segment");
    expect(result.event.payload).toMatchObject({
      segmentId: "seg-1",
      speakerLabel: "agent",
      fillerCount: 2,
    });
  });

  test("normalises the nullable columns the DB actually allows", () => {
    const parsed = TranscriptSegmentEventPayload.parse({
      callSid: "CA1",
      segmentId: "seg-1",
      speaker: 1,
      speakerLabel: null,
      text: "",
      startMs: 0,
      endMs: 0,
      fillerCount: null,
    });

    expect(parsed.speakerLabel).toBe("speaker");
    expect(parsed.fillerCount).toBe(0);
  });

  test("parses coaching_metrics, coaching_cue and coaching_session_final", () => {
    expect(
      safeParseCoachingEvent("coaching_metrics", {
        callSid: "CA1",
        wpm: 140,
        fillerCount: 1,
        pauseCount: 2,
        longPauseCount: 0,
      }).ok,
    ).toBe(true);

    expect(
      safeParseCoachingEvent("coaching_cue", {
        callSid: "CA1",
        eventId: "evt-1",
        type: "suggestion",
        severity: "warn",
        heading: "Slow down",
        suggestion: "Try pausing.",
      }).ok,
    ).toBe(true);

    expect(
      safeParseCoachingEvent("coaching_session_final", {
        callSid: "CA1",
        sessionId: "sess-1",
        wpmAvg: 130,
        fillerCount: 3,
        pauseCount: 4,
        longPauseCount: 1,
        score: 82,
        summary: "Solid call.",
      }).ok,
    ).toBe(true);
  });

  test("cue severity falls back to info when the column is null", () => {
    const parsed = CoachingCueEventPayload.parse({
      callSid: "CA1",
      eventId: "evt-1",
      type: "filler",
      severity: null,
      heading: "h",
      suggestion: "s",
    });
    expect(parsed.severity).toBe("info");
    expect(parsed.acknowledgedAt).toBeUndefined();
  });
});

describe("safeParseCoachingEvent — failure", () => {
  test("flags an unknown event type without an error string", () => {
    const result = safeParseCoachingEvent("postgres_change", { table: "call" });
    expect(result).toEqual({ ok: false, unknownType: true });
  });

  test("rejects a coaching event with a wrong-typed field", () => {
    const result = safeParseCoachingEvent("coaching_metrics", {
      callSid: "CA1",
      wpm: "fast",
      fillerCount: 1,
      pauseCount: 2,
      longPauseCount: 0,
    });

    expect(result.ok).toBe(false);
    if (result.ok || result.unknownType) throw new Error("expected a typed failure");
    expect(result.error).toContain("wpm");
  });

  test("rejects a payload missing required identifiers", () => {
    const result = safeParseCoachingEvent("transcript_segment", {
      callSid: "CA1",
      text: "hi",
    });

    expect(result.ok).toBe(false);
    if (result.ok || result.unknownType) throw new Error("expected a typed failure");
    expect(result.error).toContain("segmentId");
  });

  test("rejects an empty callSid rather than matching every call", () => {
    const result = safeParseCoachingEvent("coaching_metrics", {
      callSid: "",
      wpm: 1,
      fillerCount: 1,
      pauseCount: 1,
      longPauseCount: 1,
    });
    expect(result.ok).toBe(false);
  });

  test("never throws on hostile input", () => {
    for (const bad of [null, undefined, 42, "string", [], { callSid: {} }]) {
      expect(() => safeParseCoachingEvent("coaching_cue", bad)).not.toThrow();
      expect(safeParseCoachingEvent("coaching_cue", bad).ok).toBe(false);
    }
  });

  test("producer-side parse throws so a bad publisher fails loudly", () => {
    expect(() =>
      CoachingMetricsEventPayload.parse({ callSid: "CA1", wpm: 100 }),
    ).toThrow();
  });
});
