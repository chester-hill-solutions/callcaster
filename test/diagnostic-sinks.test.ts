import { inspect } from "node:util";
import { DrizzleQueryError } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createLogger, log } from "@/lib/logger-core";
import { redactDiagnosticValue } from "@/lib/diagnostic-redaction";
import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  init: vi.fn<(options: { beforeSend: (event: Record<string, unknown>) => unknown }) => void>(),
  setExtra: vi.fn(),
  capture: vi.fn(),
  send: vi.fn(async (_input: unknown) => ({ data: { id: "test-email" }, error: null })),
  rateLimit: vi.fn(async () => ({ ok: true, remaining: 0, resetAt: 0 })),
}));

vi.unmock("@/lib/logger.server");
vi.mock("@sentry/bun", () => ({
  init: mocks.init,
  setTag: vi.fn(),
  withScope: (callback: (scope: { setExtra: typeof mocks.setExtra }) => void) => callback({ setExtra: mocks.setExtra }),
  captureException: mocks.capture,
}));
vi.mock("@/lib/platform-rate-limit.server", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/platform-rate-limit.server")>(),
  checkRateLimit: mocks.rateLimit,
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.send };
  },
}));

const secrets = [
  "SKdummy00000000000000000000000000",
  "DUMMY_KEY_SECRET_0123456789\n    at fake.parameter.frame",
  "DUMMY_AUTH_TOKEN_0123456789abcdef",
];

function failedWrite() {
  const driver = Object.assign(new Error('column "missing_column" does not exist'), { code: "42703" });
  const error = new DrizzleQueryError(
    'update "workspace" set "key" = $1, "token" = $2, "twilio_data" = $3',
    [secrets[0], secrets[1], JSON.stringify({ authToken: secrets[2] })],
    new DrizzleQueryError("update workspace set token = $1", [secrets[1]], driver),
  );
  return error;
}

function expectNoCredentials(value: unknown) {
  const output = inspect(value, { depth: 30, breakLength: Infinity });
  for (const secret of secrets) {
    for (const line of secret.split("\n")) expect(output).not.toContain(line);
  }
}

describe("diagnostic credential boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VITEST", "");
    vi.stubEnv("E2E_TEST", "");
    vi.stubEnv("OPS_ALERT_EMAILS_ENABLED", "true");
    vi.stubEnv("OPS_ALERT_EMAIL", "ops@example.test");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  test.each(["json", "pretty"] as const)("%s logs redact direct, nested and structured copies", format => {
    const error = failedWrite();
    const logger = createLogger(false, { format, contextFields: () => ({ requestId: "request-7", authToken: secrets[2] }) });
    logger.error("workspace.write_failed", error, {
      workspaceId: "workspace-7",
      nested: { err: error, params: secrets, token: secrets[1] },
      serialized: error.message,
    });
    expectNoCredentials(vi.mocked(console.error).mock.calls);
    const output = inspect(vi.mocked(console.error).mock.calls, { depth: 30 });
    expect(output).toContain("workspace.write_failed");
    expect(output).toContain("request-7");
    expect(output).toContain("workspace-7");
    expect(output).toContain("42703");
    expect(output).toContain("missing_column");
    expect(output).toContain("diagnostic-sinks.test.ts");
    expect(error.params).toContain(secrets[1]);
    expect(error.message).toContain(secrets[2]);
  });

  test("the legacy pretty logger and message-only calls use the same boundary", () => {
    const error = failedWrite();
    log("error", false, error.message, { err: error, credential: secrets[2] });
    expectNoCredentials(vi.mocked(console.error).mock.calls);
    expect(inspect(vi.mocked(console.error).mock.calls, { depth: 30 })).toContain("[REDACTED]");
  });

  test("plain errors and cyclic context retain useful diagnostics", () => {
    const details: Record<string, unknown> = { attempt: 2, enabled: false, note: "provider unavailable" };
    details.self = details;
    const logger = createLogger(false, { format: "json" });
    logger.error("worker.failure", new Error("ordinary failure"), details);
    const entry = JSON.parse(String(vi.mocked(console.error).mock.calls[0][0]));
    expect(entry).toMatchObject({ message: "worker.failure", attempt: 2, enabled: false, note: "provider unavailable", error: { message: "ordinary failure" } });
    expect(JSON.stringify(entry)).toContain("[Circular]");
    expect(entry.error.stack).toContain("diagnostic-sinks.test.ts");
  });

  test("HTTP failures keep the caller fallback and redact the real server sinks", async () => {
    const sentry = await import("@/lib/sentry.server");
    sentry.initializeSentry("test", { SENTRY_DSN: "https://public@example.test/1" });
    const { createErrorResponse } = await import("@/lib/errors.server");
    const response = await asRouteResponse(createErrorResponse(failedWrite(), "Workspace update failed", 503));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "Workspace update failed", statusCode: 503 });
    expectNoCredentials(vi.mocked(console.error).mock.calls);
    expectNoCredentials(mocks.capture.mock.calls);
    expect(inspect(mocks.capture.mock.calls, { depth: 30 })).toContain("42703");
  });

  test("ops email, logs and error tracking exclude parameters with live sinks intercepted", async () => {
    const sentry = await import("@/lib/sentry.server");
    sentry.initializeSentry("test", { SENTRY_DSN: "https://public@example.test/1" });
    const { notifyOps } = await import("@/lib/ops-alert.server");
    const result = await notifyOps({ event: "workspace.write_failed", summary: "Workspace update failed", workspaceId: "workspace-7", error: failedWrite(), context: { credentials: { token: secrets[1] } } });
    expect(result).toEqual({ sent: true });
    expect(mocks.send).toHaveBeenCalledOnce();
    expectNoCredentials(mocks.send.mock.calls);
    expectNoCredentials(vi.mocked(console.error).mock.calls);
    expectNoCredentials(mocks.capture.mock.calls);
    expect(mocks.send.mock.calls[0][0]).toMatchObject({ to: ["ops@example.test"], subject: "[CallCaster ops] Workspace update failed", text: expect.stringContaining("workspace-7"), html: expect.stringContaining("[REDACTED]") });
  });

  test("initialized Sentry sanitizes exceptions, extra context and final SDK events", async () => {
    const { initializeSentry, captureException } = await import("@/lib/sentry.server");
    expect(initializeSentry("test", { SENTRY_DSN: "https://public@example.test/1" })).toBe(true);
    captureException(failedWrite(), { workspaceId: "workspace-7", token: secrets[1], nested: { err: failedWrite(), authorization: secrets[2] } });
    expect(mocks.capture).toHaveBeenCalledOnce();
    expectNoCredentials(mocks.capture.mock.calls);
    expectNoCredentials(mocks.setExtra.mock.calls);
    expect(mocks.setExtra).toHaveBeenCalledWith("workspaceId", "workspace-7");
    const event = { exception: { values: [{ value: failedWrite().message }] }, extra: { params: secrets, authToken: secrets[2] }, tags: { service: "test" } };
    const sanitized = mocks.init.mock.calls[0][0].beforeSend(event);
    expectNoCredentials(sanitized);
    expect(sanitized).toMatchObject({ tags: { service: "test" } });
    expect(event.extra.params).toEqual(secrets);
  });

  test("context cannot reintroduce a secret through toJSON", () => {
    const value = { toJSON: () => ({ token: secrets[1] }), secret: secrets[2], count: 3 };
    expectNoCredentials(JSON.stringify(redactDiagnosticValue(value)));
    expect(redactDiagnosticValue(value)).toMatchObject({ count: 3 });
  });
});
