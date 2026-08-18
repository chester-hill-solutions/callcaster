import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/logger.client", () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

describe("useCallRoom", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("connects to workspace SSE and does not resubscribe on status updates", async () => {
    const MockEventSource = vi.fn(function MockEventSource(this: {
      url: string;
      onopen: ((event: Event) => void) | null;
      addEventListener: ReturnType<typeof vi.fn>;
      removeEventListener: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
    }, url: string) {
      this.url = url;
      this.onopen = null;
      this.addEventListener = vi.fn();
      this.removeEventListener = vi.fn();
      this.close = vi.fn();
      queueMicrotask(() => this.onopen?.(new Event("open")));
    });

    vi.stubGlobal("EventSource", MockEventSource);

    const client = {
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
      })),
    } as any;

    const { default: useCallRoom } = await import("@/hooks/call/useCallRoom");

    renderHook(() =>
      useCallRoom({
        client,
        workspace: "w1",
        campaign: 42,
        userId: "u1",
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(EventSource).toHaveBeenCalledTimes(1);
    expect(EventSource).toHaveBeenCalledWith("/api/workspaces/w1/events");
  });

  test("normalizes raw provider statuses in predictive broadcasts to dialer vocabulary", async () => {
    const listeners = new Map<string, (event: MessageEvent<string>) => void>();

    const MockEventSource = vi.fn(function MockEventSource(this: {
      url: string;
      onopen: ((event: Event) => void) | null;
      addEventListener: ReturnType<typeof vi.fn>;
      removeEventListener: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
    }, url: string) {
      this.url = url;
      this.onopen = null;
      this.addEventListener = vi.fn(
        (type: string, handler: (event: MessageEvent<string>) => void) => {
          listeners.set(type, handler);
        },
      );
      this.removeEventListener = vi.fn();
      this.close = vi.fn();
    });

    vi.stubGlobal("EventSource", MockEventSource);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));

    const { default: useCallRoom } = await import("@/hooks/call/useCallRoom");

    const { result } = renderHook(() =>
      useCallRoom({
        workspace: "w1",
        campaign: 42,
        userId: "u1",
      }),
    );

    const emit = (payload: Record<string, unknown>) => {
      const handler = listeners.get("workspace_event");
      expect(handler).toBeDefined();
      act(() =>
        handler?.(
          new MessageEvent("workspace_event", {
            data: JSON.stringify({
              id: 1,
              workspace_id: "w1",
              event_type: "predictive_broadcast",
              payload,
              created_at: "2026-08-05T00:00:00.000Z",
            }),
          }),
        ),
      );
    };

    expect(result.current.predictiveState).toEqual({
      contact_id: null,
      status: "idle",
    });

    emit({ contact_id: 7, status: "ringing" });
    expect(result.current.predictiveState).toEqual({
      contact_id: 7,
      status: "dialing",
    });

    emit({ contact_id: 7, status: "in-progress" });
    expect(result.current.predictiveState).toEqual({
      contact_id: 7,
      status: "connected",
    });

    emit({ contact_id: 7, status: "busy" });
    expect(result.current.predictiveState).toEqual({
      contact_id: 7,
      status: "failed",
    });

    // Already-normalized dialer vocabulary passes through unchanged.
    emit({ contact_id: 8, status: "dialing" });
    expect(result.current.predictiveState).toEqual({
      contact_id: 8,
      status: "dialing",
    });
  });

  // Regression: onerror alone used to just set status: "error" with no
  // reconnect. The browser's own auto-retry covers a transient blip
  // (readyState stays CONNECTING and it retries on its own), but some
  // failures fail the connection straight to CLOSED, after which the
  // browser never retries — leaving the 5-minute presence heartbeat
  // (gated on status === "online") stopped forever.
  describe("reconnect on readyState CLOSED", () => {
    function makeMockEventSourceClass() {
      const instances: Array<{
        readyState: number;
        onopen: ((event: Event) => void) | null;
        onerror: ((event: Event) => void) | null;
        close: ReturnType<typeof vi.fn>;
      }> = [];

      class MockEventSource {
        static readonly CONNECTING = 0;
        static readonly OPEN = 1;
        static readonly CLOSED = 2;
        readyState = MockEventSource.CONNECTING;
        onopen: ((event: Event) => void) | null = null;
        onerror: ((event: Event) => void) | null = null;
        addEventListener = vi.fn();
        removeEventListener = vi.fn();
        close = vi.fn();

        constructor() {
          instances.push(this);
        }
      }

      return { MockEventSource, instances };
    }

    afterEach(() => {
      vi.useRealTimers();
    });

    test("does not reconnect when readyState is not CLOSED (browser handles its own retry)", async () => {
      const { MockEventSource, instances } = makeMockEventSourceClass();
      vi.stubGlobal("EventSource", MockEventSource);
      vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
      vi.useFakeTimers();

      const { default: useCallRoom } = await import("@/hooks/call/useCallRoom");
      const { result } = renderHook(() =>
        useCallRoom({ workspace: "w1", campaign: 42, userId: "u1" }),
      );

      const first = instances[0];
      first.readyState = MockEventSource.CONNECTING;
      act(() => first.onerror?.(new Event("error")));

      expect(result.current.status).toBe("error");
      act(() => vi.advanceTimersByTime(10_000));
      expect(instances.length).toBe(1);
    });

    test("reconnects with a new EventSource when readyState reaches CLOSED", async () => {
      const { MockEventSource, instances } = makeMockEventSourceClass();
      vi.stubGlobal("EventSource", MockEventSource);
      vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
      vi.useFakeTimers();

      const { default: useCallRoom } = await import("@/hooks/call/useCallRoom");
      const { result } = renderHook(() =>
        useCallRoom({ workspace: "w1", campaign: 42, userId: "u1" }),
      );

      const first = instances[0];
      first.readyState = MockEventSource.CLOSED;
      act(() => first.onerror?.(new Event("error")));

      expect(result.current.status).toBe("error");
      expect(instances.length).toBe(1);

      act(() => vi.advanceTimersByTime(5_000));

      expect(instances.length).toBe(2);
      expect(first.removeEventListener).toHaveBeenCalledWith(
        "workspace_event",
        expect.any(Function),
      );

      // The new connection recovering clears the error status.
      const second = instances[1];
      act(() => second.onopen?.(new Event("open")));
      expect(result.current.status).toBe("online");
    });
  });
});
