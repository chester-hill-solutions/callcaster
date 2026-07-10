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

  test("strips status from the write when the existing row is terminal and the incoming status is not", async () => {
    tenantDbMocks.findFirst.mockResolvedValueOnce({
      sid: "CA1",
      status: "completed",
      workspace: "w1",
    });
    tenantDbMocks.update.mockResolvedValueOnce([
      { sid: "CA1", status: "completed", workspace: "w1", duration: "42" },
    ]);

    const result = await updateCallBySid("w1", "CA1", {
      status: "in-progress",
      duration: "42",
    });

    expect(tenantDbMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        set: { duration: "42" },
      }),
    );
    expect(result).toMatchObject({ status: "completed", duration: "42" });
  });

  test("skips the write entirely and returns the existing row when status is the only field", async () => {
    const existing = { sid: "CA1", status: "completed", workspace: "w1" };
    tenantDbMocks.findFirst.mockResolvedValueOnce(existing);

    const result = await updateCallBySid("w1", "CA1", { status: "queued" });

    expect(tenantDbMocks.update).not.toHaveBeenCalled();
    expect(result).toBe(existing);
  });

  test("applies the status update normally when the existing status is not terminal", async () => {
    tenantDbMocks.findFirst.mockResolvedValueOnce({
      sid: "CA1",
      status: "ringing",
      workspace: "w1",
    });
    tenantDbMocks.update.mockResolvedValueOnce([
      { sid: "CA1", status: "in-progress", workspace: "w1" },
    ]);

    const result = await updateCallBySid("w1", "CA1", { status: "in-progress" });

    expect(tenantDbMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ set: { status: "in-progress" } }),
    );
    expect(result).toMatchObject({ status: "in-progress" });
  });

  test("does not read the row when the update has no status field", async () => {
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
