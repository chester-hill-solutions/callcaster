import { describe, expect, test, vi, afterEach } from "vitest";
import {
  subscribeToWorkspaceEventSource,
  resetWorkspaceEventSourcesForTests,
} from "@/lib/workspace-events-connection.client";
import { ACCESS_REVOKED_EVENT } from "@/lib/workspace-events.shared";

// The regression this module exists for: every realtime hook opened its own
// EventSource to the same /events URL. Six open SSE streams exhaust the
// browser's HTTP/1.1 six-connections-per-origin pool, and every later
// same-origin fetch (the dial POST's route discovery among them) queued
// forever. One shared connection per URL is the invariant under test.

type Listener = (event: MessageEvent<string>) => void;

function installEventSourceMock() {
  const instances: Array<{
    url: string;
    listeners: Record<string, Listener[]>;
    close: ReturnType<typeof vi.fn>;
    readyState: number;
  }> = [];

  class MockEventSource {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 2;
    url: string;
    readyState = 1;
    onerror: ((event: Event) => void) | null = null;
    listeners: Record<string, Listener[]> = {};
    close = vi.fn(() => {
      this.readyState = 2;
    });

    constructor(url: string) {
      this.url = url;
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const self = this;
      instances.push(self);
    }

    addEventListener(type: string, handler: Listener) {
      (this.listeners[type] ??= []).push(handler);
    }

    removeEventListener(type: string, handler: Listener) {
      this.listeners[type] = (this.listeners[type] ?? []).filter(
        (entry) => entry !== handler,
      );
    }

    emit(type: string, data: string) {
      for (const handler of this.listeners[type] ?? []) {
        handler(new MessageEvent(type, { data }));
      }
    }
  }

  vi.stubGlobal("EventSource", MockEventSource);
  return { instances };
}

afterEach(() => {
  resetWorkspaceEventSourcesForTests();
  vi.unstubAllGlobals();
});

describe("shared workspace EventSource", () => {
  test("many subscribers to one URL share a single connection", () => {
    const { instances } = installEventSourceMock();
    const seen: string[] = [];

    const unsubs = ["a", "b", "c", "d", "e", "f"].map((tag) =>
      subscribeToWorkspaceEventSource("/api/workspaces/w1/events", (message) =>
        seen.push(`${tag}:${message.data}`),
      ),
    );

    expect(instances).toHaveLength(1);

    (instances[0] as any).emit("workspace_event", "hello");
    expect(seen).toEqual(["a:hello", "b:hello", "c:hello", "d:hello", "e:hello", "f:hello"]);

    unsubs.forEach((unsub) => unsub());
  });

  test("distinct URLs get distinct connections", () => {
    const { instances } = installEventSourceMock();
    const u1 = subscribeToWorkspaceEventSource("/api/workspaces/w1/events", vi.fn());
    const u2 = subscribeToWorkspaceEventSource("/api/workspaces/w2/events", vi.fn());
    expect(instances).toHaveLength(2);
    u1();
    u2();
  });

  test("the connection closes only when the last subscriber leaves", () => {
    const { instances } = installEventSourceMock();
    const unsubA = subscribeToWorkspaceEventSource("/api/workspaces/w1/events", vi.fn());
    const unsubB = subscribeToWorkspaceEventSource("/api/workspaces/w1/events", vi.fn());

    unsubA();
    expect(instances[0]!.close).not.toHaveBeenCalled();

    unsubB();
    expect(instances[0]!.close).toHaveBeenCalledTimes(1);

    // A fresh subscriber after teardown gets a fresh socket, not the dead one.
    const unsubC = subscribeToWorkspaceEventSource("/api/workspaces/w1/events", vi.fn());
    expect(instances).toHaveLength(2);
    unsubC();
  });

  test("one throwing subscriber does not starve the rest of the fan-out", () => {
    const { instances } = installEventSourceMock();
    const seen: string[] = [];
    const unsubBad = subscribeToWorkspaceEventSource("/api/workspaces/w1/events", () => {
      throw new Error("boom");
    });
    const unsubGood = subscribeToWorkspaceEventSource(
      "/api/workspaces/w1/events",
      (message) => seen.push(message.data),
    );

    (instances[0] as any).emit("workspace_event", "payload");
    expect(seen).toEqual(["payload"]);

    unsubBad();
    unsubGood();
  });

  test("access revocation closes the shared connection and evicts the cache", () => {
    const { instances } = installEventSourceMock();
    const unsub = subscribeToWorkspaceEventSource("/api/workspaces/w1/events", vi.fn());

    (instances[0] as any).emit(ACCESS_REVOKED_EVENT, "");
    expect(instances[0]!.close).toHaveBeenCalled();

    // The evicted entry must not be reused: a new subscriber opens fresh.
    const unsub2 = subscribeToWorkspaceEventSource("/api/workspaces/w1/events", vi.fn());
    expect(instances).toHaveLength(2);
    unsub();
    unsub2();
  });
});
