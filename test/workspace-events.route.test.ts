import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

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
  findApiKey: vi.fn(),
}));

vi.mock("@/lib/workspace-membership.server", () => ({
  getUserRole: (...args: unknown[]) => mocks.getUserRole(...args),
}));

// The loader gates on `audit.read` via `dataPlaneCapabilityAuth`. That pulls in
// two modules this test did not previously load, and each needs its own mock or
// it reaches `@/server/db`, which the mock above deliberately does not provide
// (it exposes only `directPool`, because LISTEN is the only pool the route uses):
//
//   - `@/lib/database/workspace.server` — where the guard reads the membership
//     from. A different module from `@/lib/workspace-membership.server` above,
//     which is what the re-check inside the stream uses.
//   - `@/server/admin-db` — reached transitively via the guard's auth
//     resolution, and never touched by this route.
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  getUserRole: (...args: unknown[]) => mocks.getUserRole(...args),
}));
// `adminDb` must be a stub, not a spread: the real module is built on `db` from
// `@/server/db`, which this test mocks down to `directPool` alone. Spreading it
// evaluates the original and fails on the missing `db` export.
vi.mock("@/server/admin-db", () => ({ adminDb: {} }));

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
  resolveBearerSessionUser: async () => ({ id: "u1" }),
}));

// The re-check re-reads an API key's row, because a key can be deleted, expire
// or be narrowed after the connection opened (#2892).
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: () => ({
    workspace_api_key: {
      findFirst: (...args: unknown[]) => mocks.findApiKey(...args),
    },
  }),
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
    mocks.findApiKey.mockReset();
    mocks.findApiKey.mockResolvedValue({
      scopes: ["audit.read"],
      expires_at: null,
    });
    // `owner`, not `member`. The loader now gates on `audit.read`, which the
    // role→capability matrix grants to owners alone (app/lib/capabilities.ts:43),
    // so a `member` default is refused with 403 before the stream opens. The
    // tests that care about a *non*-owner set the role themselves.
    mocks.getUserRole.mockResolvedValue({ role: "owner" });
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

  describe("serialized event drains (#2703)", () => {
    let abort: AbortController;
    let notify: (payload: string) => void;
    let unlisten: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.useFakeTimers();
      abort = new AbortController();
      unlisten = vi.fn().mockResolvedValue(undefined);
      mocks.listen.mockImplementation(async (_channel, callback) => {
        notify = callback;
        return { unlisten };
      });
    });

    afterEach(async () => {
      abort.abort();
      await vi.advanceTimersByTimeAsync(0);
      vi.useRealTimers();
    });

    function deferred<T>() {
      let resolve!: (value: T) => void;
      let reject!: (reason: Error) => void;
      const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      return { promise, resolve, reject };
    }

    async function openStream() {
      const mod = await import(
        "../app/routes/api+/workspaces+/$workspaceId/events.loader.server"
      );
      const response = await mod.loader(
        await withDataPlaneRouteArgs({
          request: new Request("http://localhost/api/workspaces/ws-1/events", {
            signal: abort.signal,
          }),
          params: { workspaceId: "ws-1" },
        }),
      );
      const state = drain(response as Response);
      await vi.advanceTimersByTimeAsync(0);
      expect(notify).toBeTypeOf("function");
      mocks.fetchWorkspaceEventsAfter.mockClear();
      return state;
    }

    function ids(state: { text: string }) {
      return Array.from(state.text.matchAll(/^id: (\d+)$/gm), (match) => Number(match[1]));
    }

    function wake() {
      notify(JSON.stringify({ workspace_id: "ws-1" }));
    }

    test.each([1, 100])(
      "delivers paginated rows once and in order with %i notifications and overlapping polls",
      async (notifications) => {
        const state = await openStream();
        const saved = Array.from({ length: 205 }, (_, index) => eventRow(index + 1, "saved"));
        const firstRead = deferred<void>();
        let activeReads = 0;
        let maxActiveReads = 0;
        mocks.fetchWorkspaceEventsAfter.mockImplementation(async (_workspace, cursor: number) => {
          activeReads += 1;
          maxActiveReads = Math.max(maxActiveReads, activeReads);
          const page = saved.filter((row) => row.id > cursor).slice(0, 100);
          await firstRead.promise;
          activeReads -= 1;
          return page;
        });

        for (let index = 0; index < notifications; index += 1) wake();
        await vi.advanceTimersByTimeAsync(6_000);
        firstRead.resolve();
        await vi.advanceTimersByTimeAsync(0);

        expect(ids(state)).toEqual(Array.from({ length: 205 }, (_, index) => index + 1));
        expect(maxActiveReads).toBe(1);
        expect(mocks.fetchWorkspaceEventsAfter.mock.calls.length).toBeLessThanOrEqual(4);
        expect(mocks.fetchWorkspaceEventsAfter.mock.calls.map((call) => call[1]))
          .toEqual([0, 100, 200, 205]);
      },
    );

    test("re-reads a short page when an event arrives after its snapshot", async () => {
      const state = await openStream();
      const read = deferred<ReturnType<typeof eventRow>[]>();
      mocks.fetchWorkspaceEventsAfter
        .mockImplementationOnce(() => read.promise)
        .mockResolvedValueOnce([eventRow(2, "arrived-during-read")])
        .mockResolvedValue([]);

      wake();
      wake();
      read.resolve([eventRow(1, "snapshot")]);
      await vi.advanceTimersByTimeAsync(0);

      expect(ids(state)).toEqual([1, 2]);
      expect(mocks.fetchWorkspaceEventsAfter.mock.calls.map((call) => call[1])).toEqual([0, 1]);
    });

    test("ignores a notification for another workspace", async () => {
      const state = await openStream();
      mocks.fetchWorkspaceEventsAfter.mockResolvedValueOnce([eventRow(1, "poll-only")]);
      notify(JSON.stringify({ workspace_id: "another-workspace" }));
      await vi.advanceTimersByTimeAsync(0);
      expect(mocks.fetchWorkspaceEventsAfter).not.toHaveBeenCalled();
      expect(ids(state)).toEqual([]);

      await vi.advanceTimersByTimeAsync(2_000);
      expect(ids(state)).toEqual([1]);
    });

    test("uses a pending wakeup to retry a failed read from the unchanged cursor", async () => {
      const state = await openStream();
      const read = deferred<ReturnType<typeof eventRow>[]>();
      mocks.fetchWorkspaceEventsAfter
        .mockImplementationOnce(() => read.promise)
        .mockResolvedValueOnce([eventRow(1, "retry")])
        .mockResolvedValue([]);

      wake();
      for (let index = 0; index < 100; index += 1) wake();
      read.reject(new Error("temporary read failure"));
      await vi.advanceTimersByTimeAsync(0);

      expect(ids(state)).toEqual([1]);
      expect(state.text.match(/event: error/g)).toHaveLength(1);
      expect(mocks.fetchWorkspaceEventsAfter.mock.calls.map((call) => call[1])).toEqual([0, 0]);
    });

    test("releases the drain after failure so a later poll retries", async () => {
      const state = await openStream();
      mocks.fetchWorkspaceEventsAfter
        .mockRejectedValueOnce(new Error("temporary read failure"))
        .mockResolvedValueOnce([eventRow(1, "retry-on-poll")])
        .mockResolvedValue([]);

      wake();
      await vi.advanceTimersByTimeAsync(0);
      expect(ids(state)).toEqual([]);
      await vi.advanceTimersByTimeAsync(2_000);

      expect(ids(state)).toEqual([1]);
      expect(mocks.fetchWorkspaceEventsAfter.mock.calls.map((call) => call[1])).toEqual([0, 0]);
    });

    test("unsubscribes when LISTEN registration finishes after abort", async () => {
      const registration = deferred<{ unlisten: typeof unlisten }>();
      mocks.listen.mockImplementationOnce((_channel, callback) => {
        notify = callback;
        return registration.promise;
      });
      const state = await openStream();

      abort.abort();
      registration.resolve({ unlisten });
      await vi.advanceTimersByTimeAsync(2_000);
      wake();
      await vi.advanceTimersByTimeAsync(0);

      expect(state.done).toBe(true);
      expect(unlisten).toHaveBeenCalledTimes(1);
      expect(mocks.fetchWorkspaceEventsAfter).not.toHaveBeenCalled();
    });

    test.each(["abort", "access revocation"])(
      "closes on %s while a read and wakeup are pending",
      async (reason) => {
        const state = await openStream();
        const read = deferred<ReturnType<typeof eventRow>[]>();
        mocks.fetchWorkspaceEventsAfter.mockImplementation(() => read.promise);
        wake();
        wake();

        if (reason === "abort") abort.abort();
        else {
          mocks.getUserRole.mockResolvedValue(null);
          await vi.advanceTimersByTimeAsync(15_000);
          expect(state.text).toContain("access_revoked");
        }
        read.resolve([eventRow(1, "must-not-leak")]);
        await vi.advanceTimersByTimeAsync(10_000);
        wake();
        await vi.advanceTimersByTimeAsync(0);

        expect(state.done).toBe(true);
        expect(ids(state)).toEqual([]);
        expect(state.text).not.toContain("must-not-leak");
        expect(mocks.fetchWorkspaceEventsAfter).toHaveBeenCalledTimes(1);
        expect(unlisten).toHaveBeenCalledTimes(1);
      },
    );
  });

  // #2133: the stream is gated on `audit.read`. These are the auth cases the
  // old `getDataPlaneRouteContext` preamble could not express — it admitted any
  // key bound to the workspace, including one with no scopes at all.
  describe("capability gate on the stream (#2133)", () => {
    async function loadLoader() {
      return import("../app/routes/api+/workspaces+/$workspaceId/events.loader.server");
    }

    function eventRequest() {
      return new Request("http://localhost/api/workspaces/ws-1/events");
    }

    test("an API key with zero scopes is refused", async () => {
      const mod = await loadLoader();
      const response = await asRouteResponse(
        mod.loader(
          await withDataPlaneRouteArgs(
            { request: eventRequest(), params: { workspaceId: "ws-1" } },
            { userId: null, apiKey: { keyId: "key-1", scopes: [] } } as never,
          ),
        ),
      );

      // Before the gate this returned 200 and a live event stream carrying every
      // workspace event, transcripts included.
      expect(response.status).toBe(403);
    });

    test("an API key with only campaigns.read is refused", async () => {
      const mod = await loadLoader();
      const response = await asRouteResponse(
        mod.loader(
          await withDataPlaneRouteArgs(
            { request: eventRequest(), params: { workspaceId: "ws-1" } },
            { userId: null, apiKey: { keyId: "key-1", scopes: ["campaigns.read"] } } as never,
          ),
        ),
      );

      expect(response.status).toBe(403);
    });

    test("an API key with audit.read is allowed (positive control)", async () => {
      const mod = await loadLoader();
      const response = await mod.loader(
        await withDataPlaneRouteArgs(
          { request: eventRequest(), params: { workspaceId: "ws-1" } },
          { userId: null, apiKey: { keyId: "key-1", scopes: ["audit.read"] } } as never,
        ),
      );

      // The permission the gate asks for is the permission that opens it, so this
      // fails if the gate is checking something else.
      //
      // Deliberately does not read the body: a 200 here is a live SSE stream that
      // never ends, so `asRouteResponse` would block forever. The status and
      // content type are enough — the streaming behaviour has its own tests.
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    });

    test("a member session is refused, since audit.read is owner-only", async () => {
      // A control on the *role* axis as well as the scope axis. The matrix
      // grants audit.read to owners alone, so a plain member cannot open a
      // transcript-bearing stream even with a valid session.
      mocks.getUserRole.mockResolvedValue({ role: "member" });
      const mod = await loadLoader();
      const response = await asRouteResponse(
        mod.loader(
          await withDataPlaneRouteArgs({
            request: eventRequest(),
            params: { workspaceId: "ws-1" },
          }),
        ),
      );

      expect(response.status).toBe(403);
    });

    test("an owner session is allowed (positive control)", async () => {
      const mod = await loadLoader();
      const response = await mod.loader(
        await withDataPlaneRouteArgs({
          request: eventRequest(),
          params: { workspaceId: "ws-1" },
        }),
      );

      // Not drained: a 200 here is an endless stream. See the other positive
      // control above.
      expect(response.status).toBe(200);

      expect(response.status).toBe(200);
    });
  });

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

  test("stops streaming when an owner is demoted mid-stream", async () => {
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

      // Ownership transfer demotes the previous owner to admin, which does not
      // hold audit.read. Membership survives, so the old membership-only check
      // kept the transcript feed open (#2892).
      mocks.getUserRole.mockResolvedValue({ role: "admin" });
      await vi.advanceTimersByTimeAsync(15_000);

      expect(sse.text).toContain("access_revoked");
      expect(sse.done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("stops streaming when the API key is deleted mid-stream", async () => {
    vi.useFakeTimers();
    try {
      const mod = await import(
        "../app/routes/api+/workspaces+/$workspaceId/events.loader.server"
      );
      const response = await mod.loader(
        await withDataPlaneRouteArgs(
          {
            request: new Request("http://localhost/api/workspaces/ws-1/events"),
            params: { workspaceId: "ws-1" },
          },
          { userId: null, apiKey: { keyId: "key-1", scopes: ["audit.read"] } } as never,
        ),
      );
      const sse = drain(response as Response);

      // The row is gone: the key that opened the stream no longer exists.
      mocks.findApiKey.mockResolvedValue(null);
      await vi.advanceTimersByTimeAsync(15_000);

      expect(sse.text).toContain("access_revoked");
      expect(sse.done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("stops streaming when the API key's scopes are narrowed mid-stream", async () => {
    vi.useFakeTimers();
    try {
      const mod = await import(
        "../app/routes/api+/workspaces+/$workspaceId/events.loader.server"
      );
      const response = await mod.loader(
        await withDataPlaneRouteArgs(
          {
            request: new Request("http://localhost/api/workspaces/ws-1/events"),
            params: { workspaceId: "ws-1" },
          },
          { userId: null, apiKey: { keyId: "key-1", scopes: ["audit.read"] } } as never,
        ),
      );
      const sse = drain(response as Response);

      mocks.findApiKey.mockResolvedValue({ scopes: ["campaigns.read"], expires_at: null });
      await vi.advanceTimersByTimeAsync(15_000);

      expect(sse.text).toContain("access_revoked");
      expect(sse.done).toBe(true);
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
      error: "An error occurred",
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
