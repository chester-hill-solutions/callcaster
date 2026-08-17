/**
 * POST /api/workspaces/:workspaceId/client-flash (#1293) — the sink for
 * client flash telemetry. The contract under test: session-only auth (the
 * shared dataPlaneSessionAuth rejections), schema caps on every field a
 * client controls, and one server log line per event.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
});

const loggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/logger.server", () => ({ logger: loggerMock }));
vi.mock("@/server/db", () => ({ db: {}, directPool: {} }));

import { action } from "../app/routes/api+/workspaces+/$workspaceId/client-flash.action.server";
import { asRouteResponse } from "./helpers/route-result";
import { withDataPlaneRouteArgs } from "./helpers/route-context-mock";

const WORKSPACE = "11111111-1111-1111-1111-111111111111";

function flashEvent(overrides: Record<string, unknown> = {}) {
  return {
    kind: "toast-error",
    message: "This contact already has a call in progress.",
    stack: "Error\n  at showError (app.js:1:1)",
    breadcrumbs: [
      { t: 100, kind: "dial-press", detail: "type=call" },
      { t: 130, kind: "fsm", detail: "idle -> dialing" },
    ],
    url: "/workspaces/x/campaigns/1/call",
    ts: "2026-08-17T00:00:00.000Z",
    ...overrides,
  };
}

async function post(body: unknown, dataPlaneOverrides: Record<string, unknown> = {}) {
  const routeArgs = await withDataPlaneRouteArgs(
    {
      request: new Request(
        `http://localhost/api/workspaces/${WORKSPACE}/client-flash`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
      params: { workspaceId: WORKSPACE },
    },
    { workspaceId: WORKSPACE, ...dataPlaneOverrides },
  );
  return asRouteResponse(await action(routeArgs));
}

describe("POST /api/workspaces/:workspaceId/client-flash", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("logs one warn per event and answers ok", async () => {
    const response = await post({ events: [flashEvent(), flashEvent({ kind: "alert-banner", stack: undefined })] });

    expect(response.status).toBe(200);
    expect(loggerMock.warn).toHaveBeenCalledTimes(2);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      "Client flash captured",
      expect.objectContaining({
        workspaceId: WORKSPACE,
        kind: "toast-error",
        message: "This contact already has a call in progress.",
        breadcrumbs: expect.arrayContaining([
          expect.objectContaining({ kind: "dial-press" }),
        ]),
      }),
    );
  });

  test("rejects an unauthenticated (no session user) request with 401", async () => {
    const response = await post({ events: [flashEvent()] }, { userId: null });
    expect(response.status).toBe(401);
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  test("rejects an oversized message instead of logging it", async () => {
    const response = await post({
      events: [flashEvent({ message: "x".repeat(1000) })],
    });
    expect(response.status).toBe(400);
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  test("rejects more than 10 events per beacon", async () => {
    const response = await post({
      events: Array.from({ length: 11 }, () => flashEvent()),
    });
    expect(response.status).toBe(400);
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  test("rejects non-POST methods", async () => {
    const routeArgs = await withDataPlaneRouteArgs(
      {
        request: new Request(
          `http://localhost/api/workspaces/${WORKSPACE}/client-flash`,
          { method: "DELETE" },
        ),
        params: { workspaceId: WORKSPACE },
      },
      { workspaceId: WORKSPACE },
    );
    const response = asRouteResponse(await action(routeArgs));
    expect(response.status).toBe(405);
  });
});
