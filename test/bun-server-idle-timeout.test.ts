import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Regression test for the SSE reconnect-every-~10s bug (P1).
 *
 * Root cause: Bun.serve()'s default idleTimeout is 10s, but the SSE endpoint
 * (app/routes/api+/workspaces+/$workspaceId/events.loader.server.ts) only
 * wrote its first heartbeat at HEARTBEAT_INTERVAL_MS — 5s too late, so Bun
 * cut every socket before a single byte flowed (verified empirically: curl -N
 * against the running server closed at 10.05s with 0 bytes).
 *
 * This test can't spin up the real Bun.serve() server under vitest/node (no
 * Bun runtime here, and the running dev server on :3100 is an old build we
 * must not restart), so it asserts the fix at the source level: the
 * Bun.serve() call in server/bun.ts must pass an explicit idleTimeout well
 * above the heartbeat interval that keeps the stream alive.
 */
describe("server/bun.ts idleTimeout", () => {
  const bunTsSource = readFileSync(
    path.resolve(__dirname, "../server/bun.ts"),
    "utf-8",
  );
  const eventsLoaderSource = readFileSync(
    path.resolve(
      __dirname,
      "../app/routes/api+/workspaces+/$workspaceId/events.loader.server.ts",
    ),
    "utf-8",
  );

  test("Bun.serve config sets an explicit idleTimeout (not the 10s default)", () => {
    const match = bunTsSource.match(/idleTimeout:\s*(\d+)/);
    expect(match).not.toBeNull();
    const idleTimeoutSeconds = Number(match![1]);
    expect(idleTimeoutSeconds).toBeGreaterThan(10);
    // Bun's idleTimeout is capped at 255 seconds.
    expect(idleTimeoutSeconds).toBeLessThanOrEqual(255);
  });

  test("the idleTimeout comfortably exceeds the SSE heartbeat interval", () => {
    const idleMatch = bunTsSource.match(/idleTimeout:\s*(\d+)/);
    const heartbeatMatch = eventsLoaderSource.match(
      /HEARTBEAT_INTERVAL_MS\s*=\s*([\d_]+)/,
    );
    expect(idleMatch).not.toBeNull();
    expect(heartbeatMatch).not.toBeNull();

    const idleTimeoutMs = Number(idleMatch![1]) * 1000;
    const heartbeatIntervalMs = Number(heartbeatMatch![1].replace(/_/g, ""));

    expect(idleTimeoutMs).toBeGreaterThan(heartbeatIntervalMs);
  });

  test("the SSE stream writes bytes synchronously on start (before any heartbeat timer)", () => {
    // The second half of the fix: even with a generous idleTimeout, the
    // stream must not depend on the heartbeat timer for its first byte.
    expect(eventsLoaderSource).toMatch(/controller\.enqueue\(encoder\.encode\(": connected/);
  });
});
