import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import {
  createRouteContextProvider,
  withDataPlaneRouteArgs,
} from "./helpers/route-context-mock";

const mocks = vi.hoisted(() => ({
  fetchWorkspaceEventsAfter: vi.fn(),
  listen: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@/lib/workspace-events.server", () => ({
  WORKSPACE_EVENTS_NOTIFY_CHANNEL: "workspace_events",
  fetchWorkspaceEventsAfter: (...args: unknown[]) =>
    mocks.fetchWorkspaceEventsAfter(...args),
}));

vi.mock("@/server/db", () => ({
  directPool: {
    listen: (...args: unknown[]) => mocks.listen(...args),
  },
}));

vi.mock("@/lib/auth.server", () => ({
  getSession: (...args: unknown[]) => mocks.getSession(...args),
}));

describe("app/routes/api+/workspaces+/$workspaceId/events", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.fetchWorkspaceEventsAfter.mockReset();
    mocks.listen.mockReset();
    mocks.getSession.mockReset();
    mocks.getSession.mockResolvedValue({ user: { id: "u1" }, headers: new Headers() });
    mocks.fetchWorkspaceEventsAfter.mockResolvedValue([]);
    mocks.listen.mockRejectedValue(new Error("LISTEN unavailable"));
  });

  test("loader returns SSE stream when data-plane context is present", async () => {
    const mod = await import(
      "../app/routes/api+/workspaces+/$workspaceId/events.loader.server"
    );
    const response = await mod.loader(
      await withDataPlaneRouteArgs({
        request: new Request("http://localhost/api/workspaces/ws-1/events"),
        params: { workspaceId: "ws-1" },
      }),
    );

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
  });

  test("loader throws when data-plane context is missing", async () => {
    const mod = await import(
      "../app/routes/api+/workspaces+/$workspaceId/events.loader.server"
    );
    const context = await createRouteContextProvider({});
    await expect(
      mod.loader({
        request: new Request("http://localhost/api/workspaces/ws-1/events"),
        params: { workspaceId: "ws-1" },
        context,
      }),
    ).rejects.toThrow("Data plane auth context missing");
  });

  test("loader writes bytes immediately (before any heartbeat interval fires)", async () => {
    // Regression test for the reconnect-every-~10s bug: Bun's fetch server
    // has a 10s idleTimeout unless overridden (see server/bun.ts), but the
    // old code only wrote its first byte at HEARTBEAT_INTERVAL_MS (15s) —
    // 5s too late, so Bun cut the socket before any byte flowed. The stream
    // must now write a "connected" marker synchronously on start(), with no
    // timers advanced at all.
    const mod = await import(
      "../app/routes/api+/workspaces+/$workspaceId/events.loader.server"
    );
    const response = await mod.loader(
      await withDataPlaneRouteArgs({
        request: new Request("http://localhost/api/workspaces/ws-1/events"),
        params: { workspaceId: "ws-1" },
      }),
    );

    const reader = (response as Response).body!.getReader();
    const { value, done } = await reader.read();
    expect(done).toBe(false);
    const text = new TextDecoder().decode(value);
    expect(text).toContain(": connected");
    await reader.cancel();
  });

  test("loader returns 400 when workspaceId is missing", async () => {
    const mod = await import(
      "../app/routes/api+/workspaces+/$workspaceId/events.loader.server"
    );
    const response = await asRouteResponse(mod.loader(
        await withDataPlaneRouteArgs({
          request: new Request("http://localhost/api/workspaces/ws-1/events"),
          params: {},
        }),
      ),
    );

    expect(response.status).toBe(400);
  });
});
