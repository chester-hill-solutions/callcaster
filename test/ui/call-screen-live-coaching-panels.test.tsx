import { render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { CallScreenLiveCoachingPanels } from "@/components/call/CallScreen.LiveCoachingPanels";
import { useCallCoaching } from "@/hooks/call/useCallCoaching";

vi.mock("@/lib/logger.client", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const eventSourceCtor = vi.fn();

class TrackingEventSource {
  readonly url: string;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    eventSourceCtor(url);
  }

  addEventListener() {}
  removeEventListener() {}
  close = vi.fn();
}

beforeEach(() => {
  eventSourceCtor.mockReset();
  vi.stubGlobal("EventSource", TrackingEventSource);
});

describe("useCallCoaching subscribe gate", () => {
  test("does not construct an EventSource when subscribe is false", () => {
    renderHook(() => useCallCoaching("ws-1", "CA123", false));
    expect(eventSourceCtor).not.toHaveBeenCalled();
  });

  test("constructs an EventSource when subscribe is true", () => {
    renderHook(() => useCallCoaching("ws-1", "CA123", true));
    expect(eventSourceCtor).toHaveBeenCalledWith("/api/workspaces/ws-1/events");
  });

  test("subscribes by default", () => {
    renderHook(() => useCallCoaching("ws-1", "CA123"));
    expect(eventSourceCtor).toHaveBeenCalledTimes(1);
  });

  test("does not subscribe without a callSid even when enabled", () => {
    renderHook(() => useCallCoaching("ws-1", null, true));
    expect(eventSourceCtor).not.toHaveBeenCalled();
  });
});

describe("CallScreenLiveCoachingPanels flag matrix", () => {
  function renderPanels(featureFlags: Record<string, unknown>) {
    return render(
      <CallScreenLiveCoachingPanels
        workspaceId="ws-1"
        callSid="CA123"
        featureFlags={featureFlags}
      />,
    );
  }

  test("neither flag: renders nothing and opens no SSE connection", () => {
    const { container } = renderPanels({});
    expect(container).toBeEmptyDOMElement();
    expect(eventSourceCtor).not.toHaveBeenCalled();
  });

  test("transcription only: transcript tab only", () => {
    renderPanels({ liveTranscription: true });
    expect(screen.getByRole("tab", { name: "Transcript" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Coaching" })).not.toBeInTheDocument();
    expect(eventSourceCtor).toHaveBeenCalledTimes(1);
  });

  test("coaching only: coaching tab only, no transcript tab", () => {
    renderPanels({ liveCoaching: true });
    expect(screen.queryByRole("tab", { name: "Transcript" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Coaching" })).toBeInTheDocument();
    expect(eventSourceCtor).toHaveBeenCalledTimes(1);
  });

  test("both flags: both tabs", () => {
    renderPanels({ liveTranscription: true, liveCoaching: true });
    expect(screen.getByRole("tab", { name: "Transcript" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Coaching" })).toBeInTheDocument();
    expect(eventSourceCtor).toHaveBeenCalledTimes(1);
  });
});
