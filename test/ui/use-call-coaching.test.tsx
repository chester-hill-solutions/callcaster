import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  useCallCoaching,
  type CallCoachingHydration,
} from "@/hooks/call/useCallCoaching";

const loggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
}));
vi.mock("@/lib/logger.client", () => ({ logger: loggerMock }));

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

/**
 * Captures handlers so tests can push frames the way the SSE loader would.
 * Keyed by event name: the loader distinguishes `workspace_event` from the
 * terminal `access_revoked` frame, so the double must too.
 */
type SseHandler = (message: MessageEvent<string>) => void;
const listeners = new Map<string, Set<SseHandler>>();
const eventSourceCtor = vi.fn();
/** Constructed instances, so tests can assert close() on the live one. */
const instances: FakeEventSource[] = [];
const lastEventSource = () => instances.at(-1)!;

class FakeEventSource {
  onerror: ((event: Event) => void) | null = null;
  close = vi.fn();

  constructor(url: string) {
    eventSourceCtor(url);
    instances.push(this);
  }

  addEventListener(type: string, handler: SseHandler) {
    const set = listeners.get(type) ?? new Set<SseHandler>();
    set.add(handler);
    listeners.set(type, set);
  }

  removeEventListener(type: string, handler: SseHandler) {
    listeners.get(type)?.delete(handler);
  }
}

function emitAs(type: string, data: string) {
  act(() => {
    for (const handler of [...(listeners.get(type) ?? [])]) {
      handler({ data } as MessageEvent<string>);
    }
  });
}

function emit(record: unknown) {
  emitAs(
    "workspace_event",
    typeof record === "string" ? record : JSON.stringify(record),
  );
}

function frame(event_type: string, payload: unknown) {
  return { id: 1, workspace_id: "ws-1", event_type, payload, created_at: "2026-07-15T00:00:00Z" };
}

beforeEach(() => {
  listeners.clear();
  instances.length = 0;
  eventSourceCtor.mockReset();
  loggerMock.error.mockReset();
  loggerMock.warn.mockReset();
  toastMock.error.mockReset();
  vi.stubGlobal("EventSource", FakeEventSource);
});

describe("access revoked mid-stream", () => {
  test("closes the EventSource instead of letting it reconnect", () => {
    renderHook(() => useCallCoaching("ws-1", "CA123"));
    const source = lastEventSource();
    expect(source.close).not.toHaveBeenCalled();

    emitAs("access_revoked", JSON.stringify({ reason: "workspace_access_revoked" }));

    // Without an explicit close, EventSource retries a stream the middleware
    // will reject every time — a silent reconnect loop. (The revocation warn
    // now lives in the shared connection module, outside this file's logger
    // mock.)
    expect(source.close).toHaveBeenCalled();
  });

  test("leaves already-received transcript state intact", () => {
    const { result } = renderHook(() => useCallCoaching("ws-1", "CA123"));

    emit(
      frame("transcript_segment", {
        callSid: "CA123",
        segmentId: "seg-1",
        speaker: 0,
        speakerLabel: "agent",
        text: "already delivered",
        startMs: 0,
        endMs: 500,
        fillerCount: 0,
      }),
    );
    expect(result.current.segments).toHaveLength(1);

    emitAs("access_revoked", JSON.stringify({ reason: "workspace_access_revoked" }));

    // Blanking the panel mid-call would read as a transcription failure; the
    // stream simply stops.
    expect(result.current.segments).toHaveLength(1);
  });
});

describe("SSE subscribe gate (WS-1 behaviour, preserved)", () => {
  test("does not construct an EventSource when subscribe is false", () => {
    renderHook(() => useCallCoaching("ws-1", "CA123", false));
    expect(eventSourceCtor).not.toHaveBeenCalled();
  });

  test("does not subscribe when subscribe is false even with hydration present", () => {
    const hydration: CallCoachingHydration = {
      callSid: "CA123",
      segments: [
        {
          id: "seg-1",
          speaker: 0,
          speakerLabel: "agent",
          text: "hi",
          startMs: 0,
          endMs: 10,
          fillerCount: 0,
        },
      ],
      metrics: null,
      cues: [],
      session: null,
    };

    const { result } = renderHook(() => useCallCoaching("ws-1", "CA123", false, hydration));

    expect(eventSourceCtor).not.toHaveBeenCalled();
    // Hydration is loader data, not a subscription — it still seeds.
    expect(result.current.segments).toHaveLength(1);
  });

  test("subscribes when enabled and a callSid is present", () => {
    renderHook(() => useCallCoaching("ws-1", "CA123", true));
    expect(eventSourceCtor).toHaveBeenCalledWith("/api/workspaces/ws-1/events");
  });
});

describe("schema-validated SSE consumption", () => {
  test("applies a valid transcript_segment event", () => {
    const { result } = renderHook(() => useCallCoaching("ws-1", "CA123"));

    emit(
      frame("transcript_segment", {
        callSid: "CA123",
        segmentId: "seg-1",
        speaker: 0,
        speakerLabel: "agent",
        text: "hello",
        startMs: 0,
        endMs: 500,
        fillerCount: 1,
      }),
    );

    expect(result.current.segments).toEqual([
      {
        id: "seg-1",
        speaker: 0,
        speakerLabel: "agent",
        text: "hello",
        startMs: 0,
        endMs: 500,
        fillerCount: 1,
      },
    ]);
  });

  test("applies valid metrics, cue and session_final events", () => {
    const { result } = renderHook(() => useCallCoaching("ws-1", "CA123"));

    emit(
      frame("coaching_metrics", {
        callSid: "CA123",
        wpm: 145,
        fillerCount: 2,
        pauseCount: 3,
        longPauseCount: 1,
      }),
    );
    emit(
      frame("coaching_cue", {
        callSid: "CA123",
        eventId: "evt-1",
        type: "pace",
        severity: "warn",
        heading: "Slow down",
        suggestion: "Breathe.",
      }),
    );
    emit(
      frame("coaching_session_final", {
        callSid: "CA123",
        sessionId: "sess-1",
        wpmAvg: 140,
        fillerCount: 2,
        pauseCount: 3,
        longPauseCount: 1,
        score: 88,
        summary: "Good call.",
      }),
    );

    expect(result.current.metrics).toEqual({
      wpm: 145,
      fillerCount: 2,
      pauseCount: 3,
      longPauseCount: 1,
    });
    expect(result.current.cues[0]).toMatchObject({ eventId: "evt-1", heading: "Slow down" });
    expect(result.current.session).toMatchObject({ score: 88, summary: "Good call." });
  });

  test("logs and ignores a malformed payload without corrupting state", () => {
    const { result } = renderHook(() => useCallCoaching("ws-1", "CA123"));

    emit(
      frame("transcript_segment", {
        callSid: "CA123",
        segmentId: "seg-1",
        speaker: 0,
        speakerLabel: "agent",
        text: "good",
        startMs: 0,
        endMs: 5,
        fillerCount: 0,
      }),
    );
    // wpm is a string, segmentId missing: both must be dropped, not coerced.
    emit(frame("coaching_metrics", { callSid: "CA123", wpm: "very fast" }));
    emit(frame("transcript_segment", { callSid: "CA123", text: "orphan" }));

    expect(result.current.segments).toHaveLength(1);
    expect(result.current.segments[0]?.text).toBe("good");
    expect(result.current.metrics).toBeNull();
    expect(loggerMock.error).toHaveBeenCalledTimes(2);
  });

  test("logs and ignores a frame that is not valid JSON", () => {
    const { result } = renderHook(() => useCallCoaching("ws-1", "CA123"));
    expect(() => emit("{not json")).not.toThrow();
    expect(result.current.segments).toEqual([]);
    expect(loggerMock.error).toHaveBeenCalledWith("Discarded malformed workspace event frame");
  });

  test("ignores unrelated workspace events silently", () => {
    const { result } = renderHook(() => useCallCoaching("ws-1", "CA123"));
    emit(frame("postgres_change", { table: "call", new: {}, old: null }));
    expect(result.current.segments).toEqual([]);
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  test("ignores events for a different call", () => {
    const { result } = renderHook(() => useCallCoaching("ws-1", "CA123"));
    emit(
      frame("coaching_metrics", {
        callSid: "CA999",
        wpm: 200,
        fillerCount: 0,
        pauseCount: 0,
        longPauseCount: 0,
      }),
    );
    expect(result.current.metrics).toBeNull();
  });
});

describe("hydration", () => {
  const hydration: CallCoachingHydration = {
    callSid: "CA123",
    segments: [
      {
        id: "seg-1",
        speaker: 0,
        speakerLabel: "agent",
        text: "earlier line",
        startMs: 0,
        endMs: 400,
        fillerCount: 1,
      },
    ],
    metrics: null,
    cues: [
      {
        eventId: "evt-1",
        type: "filler",
        severity: "info",
        heading: "Fillers",
        suggestion: "Fewer ums.",
        acknowledgedAt: "2026-07-15T00:00:00Z",
      },
    ],
    session: null,
  };

  test("seeds state on the first render, before any SSE frame arrives", () => {
    const { result } = renderHook(() => useCallCoaching("ws-1", "CA123", true, hydration));

    expect(result.current.segments).toHaveLength(1);
    expect(result.current.segments[0]?.text).toBe("earlier line");
    expect(result.current.cues[0]?.acknowledgedAt).toBe("2026-07-15T00:00:00Z");
  });

  test("ignores hydration belonging to a different call", () => {
    const { result } = renderHook(() => useCallCoaching("ws-1", "CA999", true, hydration));
    expect(result.current.segments).toEqual([]);
    expect(result.current.cues).toEqual([]);
  });

  test("live events append onto hydrated state", () => {
    const { result } = renderHook(() => useCallCoaching("ws-1", "CA123", true, hydration));

    emit(
      frame("transcript_segment", {
        callSid: "CA123",
        segmentId: "seg-2",
        speaker: 1,
        speakerLabel: "contact",
        text: "later line",
        startMs: 500,
        endMs: 900,
        fillerCount: 0,
      }),
    );

    expect(result.current.segments.map((s) => s.id)).toEqual(["seg-1", "seg-2"]);
  });

  test("SSE replay of an already-hydrated segment does not duplicate it", () => {
    const { result } = renderHook(() => useCallCoaching("ws-1", "CA123", true, hydration));

    emit(
      frame("transcript_segment", {
        callSid: "CA123",
        segmentId: "seg-1",
        speaker: 0,
        speakerLabel: "agent",
        text: "earlier line",
        startMs: 0,
        endMs: 400,
        fillerCount: 1,
      }),
    );

    expect(result.current.segments).toHaveLength(1);
  });

  test("SSE replay of a hydrated cue keeps its acknowledged stamp", () => {
    const { result } = renderHook(() => useCallCoaching("ws-1", "CA123", true, hydration));

    // Replayed cue events never carry acknowledgedAt; a naive append would
    // resurrect the "Got it" button on an already-acknowledged cue.
    emit(
      frame("coaching_cue", {
        callSid: "CA123",
        eventId: "evt-1",
        type: "filler",
        severity: "info",
        heading: "Fillers",
        suggestion: "Fewer ums.",
      }),
    );

    expect(result.current.cues).toHaveLength(1);
    expect(result.current.cues[0]?.acknowledgedAt).toBe("2026-07-15T00:00:00Z");
  });

  test("a re-render with a new hydration object identity does not reset live state", () => {
    const { result, rerender } = renderHook(
      ({ h }: { h: CallCoachingHydration }) => useCallCoaching("ws-1", "CA123", true, h),
      { initialProps: { h: hydration } },
    );

    emit(
      frame("transcript_segment", {
        callSid: "CA123",
        segmentId: "seg-2",
        speaker: 1,
        speakerLabel: "contact",
        text: "live",
        startMs: 500,
        endMs: 900,
        fillerCount: 0,
      }),
    );

    // A loader revalidation hands back a structurally-equal but new object.
    rerender({ h: { ...hydration, segments: [...hydration.segments] } });

    expect(result.current.segments.map((s) => s.id)).toEqual(["seg-1", "seg-2"]);
  });

  test("switching to a call without hydration clears state", () => {
    const { result, rerender } = renderHook(
      ({ sid }: { sid: string }) => useCallCoaching("ws-1", sid, true, hydration),
      { initialProps: { sid: "CA123" } },
    );
    expect(result.current.segments).toHaveLength(1);

    rerender({ sid: "CA456" });
    expect(result.current.segments).toEqual([]);
    expect(result.current.cues).toEqual([]);
  });
});

describe("acknowledgeCue", () => {
  const cueFrame = frame("coaching_cue", {
    callSid: "CA123",
    eventId: "evt-1",
    type: "pace",
    severity: "warn",
    heading: "Slow down",
    suggestion: "Breathe.",
  });

  test("stamps acknowledgedAt when the server accepts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }))));
    const { result } = renderHook(() => useCallCoaching("ws-1", "CA123"));
    emit(cueFrame);

    await act(async () => {
      await result.current.acknowledgeCue("evt-1");
    });

    expect(result.current.cues[0]?.acknowledgedAt).toBeTruthy();
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  test("a 403 does not leave the cue falsely acknowledged", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 403 })));
    const { result } = renderHook(() => useCallCoaching("ws-1", "CA123"));
    emit(cueFrame);

    await act(async () => {
      await result.current.acknowledgeCue("evt-1");
    });

    await waitFor(() => expect(result.current.cues[0]?.acknowledgedAt).toBeUndefined());
    expect(toastMock.error).toHaveBeenCalledWith(
      "Could not acknowledge that cue. Please try again.",
    );
  });

  test("a 404 does not leave the cue falsely acknowledged", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("gone", { status: 404 })));
    const { result } = renderHook(() => useCallCoaching("ws-1", "CA123"));
    emit(cueFrame);

    await act(async () => {
      await result.current.acknowledgeCue("evt-1");
    });

    await waitFor(() => expect(result.current.cues[0]?.acknowledgedAt).toBeUndefined());
  });

  test("a network failure reverts the optimistic stamp and does not throw", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    const { result } = renderHook(() => useCallCoaching("ws-1", "CA123"));
    emit(cueFrame);

    await act(async () => {
      await expect(result.current.acknowledgeCue("evt-1")).resolves.toBeUndefined();
    });

    expect(result.current.cues[0]?.acknowledgedAt).toBeUndefined();
    expect(toastMock.error).toHaveBeenCalled();
  });
});
