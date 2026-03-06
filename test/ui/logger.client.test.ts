import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

describe("logger.client", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2020-01-01T00:00:00.000Z"));
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  test("logs all levels in development-like environments", async () => {
    const { logger } = await import("@/lib/logger.client");
    logger.debug("d", 1);
    logger.info("i", 2);
    logger.warn("w", 3);
    logger.error("e", 4);

    expect(console.debug).toHaveBeenCalledWith(
      "[2020-01-01T00:00:00.000Z] [DEBUG]",
      "d",
      1,
    );
    expect(console.info).toHaveBeenCalledWith("[2020-01-01T00:00:00.000Z] [INFO]", "i", 2);
    expect(console.warn).toHaveBeenCalledWith("[2020-01-01T00:00:00.000Z] [WARN]", "w", 3);
    expect(console.error).toHaveBeenCalledWith("[2020-01-01T00:00:00.000Z] [ERROR]", "e", 4);
  });

  test("suppresses debug logs when not in development", async () => {
    vi.resetModules();
    const originalWindow = (globalThis as any).window;
    try {
      (globalThis as any).window = { location: { hostname: "example.com" } };
      process.env.NODE_ENV = "production";
      const { logger } = await import("@/lib/logger.client");
      logger.debug("hidden");
      expect(console.debug).not.toHaveBeenCalled();
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });
});

