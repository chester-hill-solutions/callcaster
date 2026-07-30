import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

describe("logger.server", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2020-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  test("suppresses debug logs when not in development", async () => {
    process.env.NODE_ENV = "test";
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});

    const { logger } = await vi.importActual<typeof import("../app/lib/logger.server")>(
      "../app/lib/logger.server",
    );
    logger.debug("x");
    expect(debug).not.toHaveBeenCalled();
  });

  // Deployed environments emit JSON so Railway logs can be filtered on
  // message/requestId/workspaceId. Positional output was unqueryable.
  test("logs single-line JSON in non-development", async () => {
    process.env.NODE_ENV = "production";
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const { logger } = await vi.importActual<typeof import("../app/lib/logger.server")>(
      "../app/lib/logger.server",
    );
    logger.info("m1", { workspaceId: "ws-1" });
    logger.warn("m2", 2);
    logger.error("m3", new Error("boom"));

    const infoEntry = JSON.parse(info.mock.calls[0][0] as string);
    expect(infoEntry).toMatchObject({
      timestamp: "2020-01-01T00:00:00.000Z",
      level: "info",
      message: "m1",
      // Plain objects fold into the envelope so they are filterable.
      workspaceId: "ws-1",
    });

    // Non-object args are preserved rather than dropped.
    expect(JSON.parse(warn.mock.calls[0][0] as string)).toMatchObject({
      level: "warn",
      message: "m2",
      args: [2],
    });

    const errorEntry = JSON.parse(error.mock.calls[0][0] as string);
    expect(errorEntry.level).toBe("error");
    expect(errorEntry.error).toMatchObject({ name: "Error", message: "boom" });
    expect(typeof errorEntry.error.stack).toBe("string");
  });

  test("JSON output survives circular structures", async () => {
    process.env.NODE_ENV = "production";
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const { logger } = await vi.importActual<typeof import("../app/lib/logger.server")>(
      "../app/lib/logger.server",
    );
    const circular: Record<string, unknown> = { name: "loop" };
    circular.self = circular;
    logger.error("cyclic", circular);

    const entry = JSON.parse(error.mock.calls[0][0] as string);
    expect(entry.message).toBe("cyclic");
    expect(entry.name).toBe("loop");
  });

  test("a caller field cannot clobber the envelope", async () => {
    process.env.NODE_ENV = "production";
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    const { logger } = await vi.importActual<typeof import("../app/lib/logger.server")>(
      "../app/lib/logger.server",
    );
    logger.info("real message", { message: "impostor", level: "debug" });

    const entry = JSON.parse(info.mock.calls[0][0] as string);
    expect(entry.message).toBe("real message");
    expect(entry.level).toBe("info");
    expect(entry.field_message).toBe("impostor");
  });

  test("allows debug logs in development", async () => {
    process.env.NODE_ENV = "development";
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});

    const { logger } = await vi.importActual<typeof import("../app/lib/logger.server")>(
      "../app/lib/logger.server",
    );
    logger.debug("dbg", { a: 1 });

    expect(debug).toHaveBeenCalledWith(
      "[2020-01-01T00:00:00.000Z] [DEBUG]",
      "dbg",
      { a: 1 },
    );
  });
});

