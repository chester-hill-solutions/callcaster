import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  captureException: vi.fn(),
  send: vi.fn(async () => ({ data: { id: "e1" }, error: null })),
  checkRateLimit: vi.fn(async () => ({ ok: true, remaining: 0, resetAt: 0 })),
}));

vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/sentry.server", () => ({
  captureException: (...args: unknown[]) => mocks.captureException(...args),
}));
vi.mock("@/lib/platform-rate-limit.server", () => ({
  checkRateLimit: (...args: unknown[]) => mocks.checkRateLimit(...args),
}));
vi.mock("@/lib/env.server", () => ({
  env: {
    RESEND_API_KEY: () => "re_test",
    TWILIO_COMPLIANCE_NOTIFY_EMAIL: () => "ops@example.com",
  },
}));
vi.mock("resend", () => {
  class Resend {
    emails = { send: (...args: unknown[]) => mocks.send(...args) };
    constructor(_key: string) {}
  }
  return { Resend };
});

import { notifyOps, resetOpsAlertsForTests } from "@/lib/ops-alert.server";

describe("notifyOps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetOpsAlertsForTests();
  });

  test("suppresses the email when the dedupe store is unreachable", async () => {
    // A crash-looping process restarts constantly and wipes the in-memory map,
    // so without a durable dedupe one incident mails on every restart. That
    // happened in production. Fail CLOSED: the log line is already written.
    mocks.checkRateLimit.mockRejectedValue(new Error("db down"));
    // Emails are normally short-circuited under test; lift that here so the
    // dedupe path is actually exercised.
    vi.stubEnv("VITEST", "");
    process.env.NODE_ENV = "production";
    try {
      const result = await notifyOps({ event: "worker.uncaught_exception", summary: "boom" });
      expect(mocks.send).not.toHaveBeenCalled();
      expect(result).toEqual({ sent: false, reason: "capped" });
      expect(mocks.logger.error).toHaveBeenCalledWith(
        "ops.alert",
        expect.objectContaining({ event: "worker.uncaught_exception" }),
      );
    } finally {
      process.env.NODE_ENV = "test";
      vi.unstubAllEnvs();
    }
  });

  test("logs before anything that can fail, so the alert survives an outage", async () => {
    // Both the rate limiter and the mailer are down.
    mocks.checkRateLimit.mockRejectedValue(new Error("db down"));
    mocks.send.mockRejectedValue(new Error("resend down"));

    const result = await notifyOps({
      event: "worker.job.dead_letter",
      summary: "job died",
      jobType: "billing_reconcile",
    });

    expect(mocks.logger.error).toHaveBeenCalledWith(
      "ops.alert",
      expect.objectContaining({ event: "worker.job.dead_letter" }),
    );
    // Never throws, whatever fails downstream.
    expect(result.sent).toBe(false);
  });

  test("dedupes repeats in-process before touching the database", async () => {
    await notifyOps({ event: "e", summary: "first" });
    mocks.checkRateLimit.mockClear();

    const second = await notifyOps({ event: "e", summary: "second" });

    expect(second).toEqual({ sent: false, reason: "deduped" });
    // The point of the in-memory check: safe to call when Postgres is broken.
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
  });

  test("distinct dedupe keys are independent", async () => {
    await notifyOps({ event: "e", summary: "a", dedupeKey: "k1" });
    const other = await notifyOps({ event: "e", summary: "b", dedupeKey: "k2" });

    expect(other.reason).not.toBe("deduped");
  });

  test('severity "warn" reports but never emails', async () => {
    const result = await notifyOps({
      event: "e",
      summary: "informational",
      severity: "warn",
    });

    expect(mocks.logger.error).toHaveBeenCalled();
    expect(mocks.captureException).toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(result.sent).toBe(false);
  });

  test("does not email outside production (PR previews run this code too)", async () => {
    const result = await notifyOps({ event: "e", summary: "s" });

    expect(mocks.send).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: false, reason: "disabled" });
  });

  test("always reports to Sentry so a DSN is a one-variable upgrade", async () => {
    await notifyOps({ event: "e", summary: "s", error: new Error("boom") });

    expect(mocks.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ event: "e" }),
    );
  });
});
