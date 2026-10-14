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
vi.mock("@/lib/logger.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logger.server")>()), logger: loggerMock,
}));
vi.mock("@/server/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/db")>()), db: {}, directPool: {},
}));

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

  test("retains legacy error-toast stacks and breadcrumbs at error level", async () => {
    const response = await post({ events: [flashEvent()] });

    expect(response.status).toBe(200);
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(loggerMock.error).toHaveBeenCalledWith(
      "Client flash captured",
      expect.objectContaining({
        workspaceId: WORKSPACE,
        kind: "toast-error",
        severity: "error",
        stack: "Error\n  at showError (app.js:1:1)",
        flashMessage: "This contact already has a call in progress.",
        breadcrumbs: expect.arrayContaining([
          expect.objectContaining({ kind: "dial-press" }),
        ]),
      }),
    );
  });

  test.each([
    ["neutral", "info"], ["info", "info"], ["success", "info"],
    ["warning", "warn"], ["error", "error"],
  ] as const)("records explicit %s banner severity at %s level", async (severity, level) => {
    const response = await post({ events: [flashEvent({ kind: "alert-banner", severity, stack: undefined })] });
    expect(response.status).toBe(200);
    expect(loggerMock[level]).toHaveBeenCalledWith("Client flash captured", expect.objectContaining({ workspaceId: WORKSPACE, severity }));
    expect(loggerMock[level]).toHaveBeenCalledTimes(1);
    if (level === "info") {
      expect(loggerMock.warn).not.toHaveBeenCalled();
      expect(loggerMock.error).not.toHaveBeenCalled();
    }
  });

  test("retains unclassified legacy banners without inventing warning or error severity", async () => {
    const response = await post({ events: [flashEvent({ kind: "alert-banner", stack: undefined })] });
    expect(response.status).toBe(200);
    expect(loggerMock.info).toHaveBeenCalledWith("Client flash captured", expect.objectContaining({ severity: undefined }));
    expect(loggerMock.warn).not.toHaveBeenCalled();
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  test.each([
    { kind: "alert-banner", severity: "alert" },
    { kind: "toast-error", severity: "success" },
    { kind: "toast-warning", severity: "error" },
  ])("rejects an invalid or conflicting severity: %j", async (fields) => {
    const response = await post({ events: [flashEvent(fields)] });
    expect(response.status).toBe(400);
    expect(loggerMock.info).not.toHaveBeenCalled();
    expect(loggerMock.warn).not.toHaveBeenCalled();
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  test("rejects an unauthenticated (no session user) request with 401", async () => {
    const response = await post({ events: [flashEvent()] }, { userId: null });
    expect(response.status).toBe(401);
    expect(loggerMock.warn).not.toHaveBeenCalled();
    expect(loggerMock.error).not.toHaveBeenCalled();
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

  test.each([
    { stack: "x".repeat(4101) },
    { breadcrumbs: Array.from({ length: 51 }, () => ({ t: 0, kind: "dial", detail: "test" })) },
    { breadcrumbs: [{ t: 0, kind: "x".repeat(61), detail: "test" }] },
    { breadcrumbs: [{ t: 0, kind: "dial", detail: "x".repeat(221) }] },
    { breadcrumbs: [{ t: null, kind: "dial", detail: "test" }] },
    { url: "x".repeat(321) },
    { ts: "x".repeat(41) },
  ])("retains the bounded payload contract: %j", async (fields) => {
    const response = await post({ events: [flashEvent(fields)] });
    expect(response.status).toBe(400);
    expect(loggerMock.info).not.toHaveBeenCalled();
    expect(loggerMock.warn).not.toHaveBeenCalled();
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  test("rejects malformed JSON before logging", async () => {
    const args = await withDataPlaneRouteArgs({ request: new Request(`http://localhost/api/workspaces/${WORKSPACE}/client-flash`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{broken",
    }), params: { workspaceId: WORKSPACE } }, { workspaceId: WORKSPACE });
    const response = await asRouteResponse(await action(args));
    expect(response.status).toBe(400);
    expect(loggerMock.error).not.toHaveBeenCalled();
    expect(loggerMock.warn).not.toHaveBeenCalled();
    expect(loggerMock.info).not.toHaveBeenCalled();
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
    const response = await asRouteResponse(await action(routeArgs));
    expect(response.status).toBe(405);
  });
});
