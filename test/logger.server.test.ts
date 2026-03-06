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

  test("logs info/warn/error in non-development", async () => {
    process.env.NODE_ENV = "production";
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const { logger } = await vi.importActual<typeof import("../app/lib/logger.server")>(
      "../app/lib/logger.server",
    );
    logger.info("m1", 1);
    logger.warn("m2", 2);
    logger.error("m3", 3);

    expect(info).toHaveBeenCalledWith(
      "[2020-01-01T00:00:00.000Z] [INFO]",
      "m1",
      1,
    );
    expect(warn).toHaveBeenCalledWith(
      "[2020-01-01T00:00:00.000Z] [WARN]",
      "m2",
      2,
    );
    expect(error).toHaveBeenCalledWith(
      "[2020-01-01T00:00:00.000Z] [ERROR]",
      "m3",
      3,
    );
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

