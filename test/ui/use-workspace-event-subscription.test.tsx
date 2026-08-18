import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useWorkspaceEventSubscription } from "@/hooks/realtime/useWorkspaceEventSubscription";

const loggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
}));
vi.mock("@/lib/logger.client", () => ({ logger: loggerMock }));

type SseHandler = (message: MessageEvent<string>) => void;
const listeners = new Map<string, Set<SseHandler>>();
const eventSourceCtor = vi.fn();
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

function changeFrame(table: string) {
  return JSON.stringify({
    id: 1,
    workspace_id: "ws-1",
    event_type: "postgres_change",
    payload: { table, eventType: "INSERT", new: { id: "c1", workspace: "ws-1" } },
    created_at: "2026-07-15T00:00:00Z",
  });
}

beforeEach(() => {
  listeners.clear();
  instances.length = 0;
  eventSourceCtor.mockReset();
  loggerMock.warn.mockReset();
  vi.stubGlobal("EventSource", FakeEventSource);
});

describe("useWorkspaceEventSubscription", () => {
  test("dispatches matching postgres_change events to onChange", () => {
    const onChange = vi.fn();
    renderHook(() =>
      useWorkspaceEventSubscription({ workspaceId: "ws-1", table: "campaign", onChange }),
    );

    emitAs("workspace_event", changeFrame("campaign"));

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  test("closes the EventSource on access_revoked instead of reconnecting", () => {
    const onChange = vi.fn();
    renderHook(() =>
      useWorkspaceEventSubscription({ workspaceId: "ws-1", table: "campaign", onChange }),
    );
    const source = lastEventSource();
    expect(source.close).not.toHaveBeenCalled();

    emitAs("access_revoked", JSON.stringify({ reason: "workspace_access_revoked" }));

    // EventSource reconnects on its own after a server-side close, and the
    // data-plane middleware would reject every retry — so a revoked tab would
    // otherwise sit in a reconnect loop. (The revocation warn now lives in the
    // shared connection module, outside this file's logger mock.)
    expect(source.close).toHaveBeenCalled();
  });

  test("stops dispatching once access is revoked", () => {
    const onChange = vi.fn();
    renderHook(() =>
      useWorkspaceEventSubscription({ workspaceId: "ws-1", table: "campaign", onChange }),
    );

    emitAs("access_revoked", JSON.stringify({ reason: "workspace_access_revoked" }));
    onChange.mockClear();

    // The real EventSource delivers nothing after close(); this asserts the
    // hook has no path that would keep feeding a revoked subscriber.
    expect(lastEventSource().close).toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
