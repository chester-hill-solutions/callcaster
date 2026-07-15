/**
 * Hydration reaches the panels.
 *
 * `initialCoaching` is threaded loader -> useCallScreen -> CallScreen.Layout ->
 * CallScreenLiveCoachingPanels -> useCallCoaching. These tests drive the last
 * two links (the component boundary the loader payload actually lands on) and
 * assert the reload-mid-call behaviour the prop exists for: pre-existing
 * segments and cues are on screen at first paint, without waiting for SSE.
 */
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { CallScreenLiveCoachingPanels } from "@/components/call/CallScreen.LiveCoachingPanels";
import type { CallCoachingHydration } from "@/hooks/call/useCallCoaching";

vi.mock("@/lib/logger.client", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const eventSourceCtor = vi.fn();
const listeners = new Set<(event: MessageEvent<string>) => void>();

class FakeEventSource {
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    eventSourceCtor(url);
  }

  addEventListener(_type: string, handler: (event: MessageEvent<string>) => void) {
    listeners.add(handler);
  }

  removeEventListener(_type: string, handler: (event: MessageEvent<string>) => void) {
    listeners.delete(handler);
  }

  close = vi.fn();
}

/** Push one `workspace_event` SSE frame at every mounted subscriber. */
function emitWorkspaceEvent(eventType: string, payload: Record<string, unknown>) {
  const data = JSON.stringify({
    id: 1,
    workspace_id: "ws-1",
    event_type: eventType,
    payload,
    created_at: "2026-07-15T00:00:00Z",
  });
  act(() => {
    for (const handler of listeners) {
      handler(new MessageEvent("workspace_event", { data }));
    }
  });
}

const hydration: CallCoachingHydration = {
  callSid: "CA123",
  segments: [
    {
      id: "seg-1",
      speaker: 0,
      speakerLabel: "agent",
      text: "Hello from before the reload",
      startMs: 0,
      endMs: 400,
      fillerCount: 0,
    },
  ],
  metrics: null,
  cues: [
    {
      eventId: "evt-1",
      type: "pace",
      severity: "warn",
      heading: "Slow down",
      suggestion: "Breathe between sentences.",
    },
  ],
  session: null,
};

const bothFlags = { liveTranscription: true, liveCoaching: true };

beforeEach(() => {
  eventSourceCtor.mockReset();
  listeners.clear();
  vi.stubGlobal("EventSource", FakeEventSource);
});

describe("CallScreenLiveCoachingPanels hydration", () => {
  test("a late mount mid-call paints pre-existing segments and cues before any SSE frame", () => {
    render(
      <CallScreenLiveCoachingPanels
        workspaceId="ws-1"
        callSid="CA123"
        featureFlags={bothFlags}
        initialCoaching={hydration}
      />,
    );

    // Transcript tab is the default; the segment is on screen with no traffic.
    expect(screen.getByText("Hello from before the reload")).toBeInTheDocument();
    expect(listeners.size).toBe(1);
  });

  test("hydrated cues are rendered, not just hydrated segments", () => {
    render(
      <CallScreenLiveCoachingPanels
        workspaceId="ws-1"
        callSid="CA123"
        featureFlags={{ liveCoaching: true }}
        initialCoaching={hydration}
      />,
    );

    expect(screen.getByText("Slow down")).toBeInTheDocument();
    expect(screen.getByText("Breathe between sentences.")).toBeInTheDocument();
  });

  test("an SSE replay of an already-hydrated segment does not duplicate it", () => {
    render(
      <CallScreenLiveCoachingPanels
        workspaceId="ws-1"
        callSid="CA123"
        featureFlags={bothFlags}
        initialCoaching={hydration}
      />,
    );

    // A fresh EventSource has no Last-Event-ID, so the stream replays segments
    // hydration already delivered. Same segmentId => one row, not two.
    emitWorkspaceEvent("transcript_segment", {
      callSid: "CA123",
      segmentId: "seg-1",
      speaker: 0,
      speakerLabel: "agent",
      text: "Hello from before the reload",
      startMs: 0,
      endMs: 400,
      fillerCount: 0,
    });

    expect(screen.getAllByText("Hello from before the reload")).toHaveLength(1);

    // A genuinely new segment still lands.
    emitWorkspaceEvent("transcript_segment", {
      callSid: "CA123",
      segmentId: "seg-2",
      speaker: 1,
      speakerLabel: "contact",
      text: "Live segment after hydration",
      startMs: 500,
      endMs: 900,
      fillerCount: 0,
    });

    expect(screen.getByText("Live segment after hydration")).toBeInTheDocument();
  });

  test("an SSE replay of a hydrated cue neither duplicates it nor drops its ack", () => {
    const acknowledged: CallCoachingHydration = {
      ...hydration,
      cues: [{ ...hydration.cues[0]!, acknowledgedAt: "2026-07-15T00:00:00Z" }],
    };

    render(
      <CallScreenLiveCoachingPanels
        workspaceId="ws-1"
        callSid="CA123"
        featureFlags={{ liveCoaching: true }}
        initialCoaching={acknowledged}
      />,
    );

    // The replayed live event carries no acknowledgedAt; keeping the hydrated
    // entry is what preserves the ack.
    emitWorkspaceEvent("coaching_cue", {
      callSid: "CA123",
      eventId: "evt-1",
      type: "pace",
      severity: "warn",
      heading: "Slow down",
      suggestion: "Breathe between sentences.",
    });

    expect(screen.getAllByText("Slow down")).toHaveLength(1);
    // An acknowledged cue offers no "Got it" control.
    expect(
      screen.queryByRole("button", { name: "Got it" }),
    ).not.toBeInTheDocument();
  });

  test("hydration for a different call is ignored rather than pinned onto this one", () => {
    render(
      <CallScreenLiveCoachingPanels
        workspaceId="ws-1"
        callSid="CA-other"
        featureFlags={bothFlags}
        initialCoaching={hydration}
      />,
    );

    expect(
      screen.queryByText("Hello from before the reload"),
    ).not.toBeInTheDocument();
  });

  test("flags off: hydration is not rendered and no EventSource is opened", () => {
    const { container } = render(
      <CallScreenLiveCoachingPanels
        workspaceId="ws-1"
        callSid="CA123"
        featureFlags={{}}
        initialCoaching={hydration}
      />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(eventSourceCtor).not.toHaveBeenCalled();
  });
});
