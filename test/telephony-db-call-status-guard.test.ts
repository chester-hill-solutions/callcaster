import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

vi.mock("@/lib/logger.server", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/admin-db", () => ({ adminDb: {} }));

const tenantDbMocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => ({
    call: {
      findFirst: (...args: unknown[]) => tenantDbMocks.findFirst(...args),
      update: (...args: unknown[]) => tenantDbMocks.update(...args),
    },
  })),
}));

import { SQL } from "drizzle-orm";

import { canTransitionCallStatus, updateCallBySid } from "../app/lib/telephony-db.server";

describe("canTransitionCallStatus", () => {
  test("allows any transition when there is no current status", () => {
    expect(canTransitionCallStatus(null, "queued")).toBe(true);
    expect(canTransitionCallStatus(undefined, "completed")).toBe(true);
  });

  test("allows terminal -> terminal", () => {
    expect(canTransitionCallStatus("completed", "failed")).toBe(true);
    expect(canTransitionCallStatus("busy", "no-answer")).toBe(true);
    expect(canTransitionCallStatus("canceled", "canceled")).toBe(true);
  });

  test("allows non-terminal -> non-terminal and non-terminal -> terminal", () => {
    expect(canTransitionCallStatus("ringing", "in-progress")).toBe(true);
    expect(canTransitionCallStatus("in-progress", "completed")).toBe(true);
    expect(canTransitionCallStatus("queued", "initiated")).toBe(true);
  });

  test("blocks terminal -> non-terminal regressions", () => {
    expect(canTransitionCallStatus("completed", "queued")).toBe(false);
    expect(canTransitionCallStatus("completed", "in-progress")).toBe(false);
    expect(canTransitionCallStatus("failed", "ringing")).toBe(false);
    expect(canTransitionCallStatus("busy", "initiated")).toBe(false);
    expect(canTransitionCallStatus("no-answer", "queued")).toBe(false);
    expect(canTransitionCallStatus("canceled", "in-progress")).toBe(false);
  });

  test("is case-insensitive", () => {
    expect(canTransitionCallStatus("Completed", "Queued")).toBe(false);
  });
});

describe("updateCallBySid status regression guard", () => {
  beforeEach(() => {
    tenantDbMocks.findFirst.mockReset();
    tenantDbMocks.update.mockReset();
  });

  // The guard is now enforced atomically inside a single UPDATE via a CASE
  // expression (see updateCallBySid) rather than a read-then-conditional-write.
  // These tests pin that contract: the row is never read first, exactly one
  // guarded UPDATE is issued whenever a status is present, and the status the
  // DB actually applies is a SQL CASE expression (not the raw incoming value),
  // so an out-of-order terminal->non-terminal webhook can't win a race.
  const getSetArg = () =>
    (tenantDbMocks.update.mock.calls[0]?.[0] as { set: Record<string, unknown> })
      .set;

  test("issues a single guarded UPDATE (no prior read) and passes other fields through when a status is present", async () => {
    tenantDbMocks.update.mockResolvedValueOnce([
      { sid: "CA1", status: "completed", workspace: "w1", duration: "42" },
    ]);

    const result = await updateCallBySid("w1", "CA1", {
      status: "in-progress",
      duration: "42",
    });

    // No read-then-write round trip: the guard lives in the UPDATE itself.
    expect(tenantDbMocks.findFirst).not.toHaveBeenCalled();
    expect(tenantDbMocks.update).toHaveBeenCalledTimes(1);

    const set = getSetArg();
    // status is written as a guarded CASE expression, not the raw value, so a
    // terminal existing row is protected in-SQL (the DB keeps "completed").
    expect(set.status).toBeInstanceOf(SQL);
    expect(set.status).not.toBe("in-progress");
    expect(set.duration).toBe("42");
    expect(result).toMatchObject({ status: "completed", duration: "42" });
  });

  test("still issues one guarded UPDATE (no skip, no read) when status is the only field", async () => {
    tenantDbMocks.update.mockResolvedValueOnce([
      { sid: "CA1", status: "completed", workspace: "w1" },
    ]);

    const result = await updateCallBySid("w1", "CA1", { status: "queued" });

    expect(tenantDbMocks.findFirst).not.toHaveBeenCalled();
    expect(tenantDbMocks.update).toHaveBeenCalledTimes(1);
    expect(getSetArg().status).toBeInstanceOf(SQL);
    // The RETURNING row reflects what the DB actually applied — here the CASE
    // keeps the terminal "completed" rather than regressing to "queued".
    expect(result).toMatchObject({ status: "completed" });
  });

  test("applies the incoming status via the guarded write when the existing status is not terminal", async () => {
    tenantDbMocks.update.mockResolvedValueOnce([
      { sid: "CA1", status: "in-progress", workspace: "w1" },
    ]);

    const result = await updateCallBySid("w1", "CA1", { status: "in-progress" });

    expect(tenantDbMocks.findFirst).not.toHaveBeenCalled();
    expect(getSetArg().status).toBeInstanceOf(SQL);
    expect(result).toMatchObject({ status: "in-progress" });
  });

  test("does not wrap the write in the guard when the update has no status field", async () => {
    tenantDbMocks.update.mockResolvedValueOnce([
      { sid: "CA1", recording_url: "https://rec" },
    ]);

    await updateCallBySid("w1", "CA1", { recording_url: "https://rec" });

    expect(tenantDbMocks.findFirst).not.toHaveBeenCalled();
    expect(tenantDbMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ set: { recording_url: "https://rec" } }),
    );
  });
});
