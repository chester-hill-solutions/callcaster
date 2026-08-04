import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import {
  createRouteContextProvider,
  withDataPlaneRouteArgs,
} from "./helpers/route-context-mock";

const mocks = vi.hoisted(() => ({
  fetchWorkspaceEventsAfter: vi.fn(),
  getLatestWorkspaceEventId: vi.fn(),
  listen: vi.fn(),
  getSession: vi.fn(),
  getUserRole: vi.fn(),
}));

vi.mock("@/lib/workspace-membership.server", () => ({
  getUserRole: (...args: unknown[]) => mocks.getUserRole(...args),
}));

vi.mock("@/lib/workspace-events.server", () => ({
  WORKSPACE_EVENTS_NOTIFY_CHANNEL: "workspace_events",
  fetchWorkspaceEventsAfter: (...args: unknown[]) =>
    mocks.fetchWorkspaceEventsAfter(...args),
  getLatestWorkspaceEventId: (...args: unknown[]) =>
    mocks.getLatestWorkspaceEventId(...args),
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
    mocks.getLatestWorkspaceEventId.mockReset();
    mocks.getLatestWorkspaceEventId.mockResolvedValue(0);
    mocks.listen.mockReset();
    mocks.getSession.mockReset();
    mocks.getSession.mockResolvedValue({ user: { id: "u1" }, headers: new Headers() });
    mocks.fetchWorkspaceEventsAfter.mockResolvedValue([]);
    mocks.listen.mockRejectedValue(new Error("LISTEN unavailable"));
    mocks.getUserRole.mockReset();
    mocks.getUserRole.mockResolvedValue({ role: "member" });
  });

  /** Drain an SSE body in the background, accumulating decoded text. */
  function drain(response: Response) {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const state = { text: "", done: false };
    void (async () => {
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          state.text += decoder.decode(chunk.value, { stream: true });
        }
      } catch {
        // Stream torn down; `done` below is what the assertions care about.
      }
      state.done = true;
    })();
    return state;
  }

  function eventRow(id: number, text: string) {
    return {
      id,
      workspace_id: "ws-1",
      event_type: "transcript_segment",
      payload: { callSid: "CA1", text },
      created_at: "2026-07-15T00:00:00.000Z",
    };
  }

  test("stops streaming once the member's access is revoked mid-stream", async () => {
    vi.useFakeTimers();
    try {
      const mod = await import(
        "../app/routes/api+/workspaces+/$workspaceId/events.loader.server"
      );
      const response = await mod.loader(
        await withDataPlaneRouteArgs({
          request: new Request("http://localhost/api/workspaces/ws-1/events"),
          params: { workspaceId: "ws-1" },
        }),
      );
      const sse = drain(response as Response);

      // Still a member: transcript content flows as normal.
      mocks.fetchWorkspaceEventsAfter
        .mockResolvedValueOnce([eventRow(1, "while-a-member")])
        .mockResolvedValue([]);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(sse.text).toContain("while-a-member");

      // Access is revoked. The re-check rides the heartbeat, so exposure is
      // bounded by one heartbeat interval — not zero.
      mocks.getUserRole.mockResolvedValue(null);
      await vi.advanceTimersByTimeAsync(15_000);

      expect(sse.text).toContain("access_revoked");
      expect(sse.done).toBe(true);

      // Nothing further reaches a revoked member, even as events keep landing.
      mocks.fetchWorkspaceEventsAfter
        .mockResolvedValueOnce([eventRow(2, "after-revocation")])
        .mockResolvedValue([]);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(sse.text).not.toContain("after-revocation");
    } finally {
      vi.useRealTimers();
    }
  });

  test("keeps streaming while membership holds, and re-checks on heartbeat", async () => {
    vi.useFakeTimers();
    try {
      const mod = await import(
        "../app/routes/api+/workspaces+/$workspaceId/events.loader.server"
      );
      const response = await mod.loader(
        await withDataPlaneRouteArgs({
          request: new Request("http://localhost/api/workspaces/ws-1/events"),
          params: { workspaceId: "ws-1" },
        }),
      );
      const sse = drain(response as Response);

      await vi.advanceTimersByTimeAsync(45_000);

      expect(mocks.getUserRole).toHaveBeenCalled();
      expect(sse.text).not.toContain("access_revoked");
      expect(sse.done).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a transient membership-lookup failure does not drop the stream", async () => {
    vi.useFakeTimers();
    try {
      const mod = await import(
        "../app/routes/api+/workspaces+/$workspaceId/events.loader.server"
      );
      const response = await mod.loader(
        await withDataPlaneRouteArgs({
          request: new Request("http://localhost/api/workspaces/ws-1/events"),
          params: { workspaceId: "ws-1" },
        }),
      );
      const sse = drain(response as Response);

      // A DB blip is not evidence of revocation; connect-time auth already
      // passed. Tearing every stream down on a hiccup would be a self-inflicted
      // outage, and the next tick re-checks anyway.
      mocks.getUserRole.mockRejectedValue(new Error("connection terminated"));
      await vi.advanceTimersByTimeAsync(15_000);

      expect(sse.text).not.toContain("access_revoked");
      expect(sse.done).toBe(false);

      // ...but a real revocation still closes it on a later tick.
      mocks.getUserRole.mockResolvedValue(null);
      await vi.advanceTimersByTimeAsync(15_000);
      expect(sse.text).toContain("access_revoked");
      expect(sse.done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * A fresh connection used to start at cursor 0, replaying the workspace's
   * entire event history to a client whose state had just been built by
   * loaders — re-applying stale row changes over current data, and growing
   * without bound because the log is append-only and was never pruned.
   */
  test("a first connection starts at the current tip, not the beginning", async () => {
    mocks.getLatestWorkspaceEventId.mockResolvedValue(4821);
    const mod = await import(
      "../app/routes/api+/workspaces+/$workspaceId/events.loader.server"
    );

    await mod.loader(
      await withDataPlaneRouteArgs({
        request: new Request("http://localhost/api/workspaces/ws-1/events"),
        params: { workspaceId: "ws-1" },
      }),
    );

    await vi.waitFor(() => expect(mocks.fetchWorkspaceEventsAfter).toHaveBeenCalled());
    expect(mocks.fetchWorkspaceEventsAfter).toHaveBeenCalledWith("ws-1", 4821);
    expect(mocks.fetchWorkspaceEventsAfter).not.toHaveBeenCalledWith("ws-1", 0);
  });

  test("a reconnect resumes from Last-Event-ID and does not skip ahead", async () => {
    mocks.getLatestWorkspaceEventId.mockResolvedValue(4821);
    const mod = await import(
      "../app/routes/api+/workspaces+/$workspaceId/events.loader.server"
    );

    await mod.loader(
      await withDataPlaneRouteArgs({
        request: new Request("http://localhost/api/workspaces/ws-1/events", {
          headers: { "Last-Event-ID": "300" },
        }),
        params: { workspaceId: "ws-1" },
      }),
    );

    // Resuming must replay what the client missed, so the tip is not consulted.
    await vi.waitFor(() => expect(mocks.fetchWorkspaceEventsAfter).toHaveBeenCalled());
    expect(mocks.fetchWorkspaceEventsAfter).toHaveBeenCalledWith("ws-1", 300);
    expect(mocks.getLatestWorkspaceEventId).not.toHaveBeenCalled();
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

  test("loader returns 500 when data-plane context is missing", async () => {
    const mod = await import(
      "../app/routes/api+/workspaces+/$workspaceId/events.loader.server"
    );
    const context = await createRouteContextProvider({});
    const response = await asRouteResponse(
      mod.loader({
        request: new Request("http://localhost/api/workspaces/ws-1/events"),
        params: { workspaceId: "ws-1" },
        context,
      }),
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: "Data plane auth context missing",
    });
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
