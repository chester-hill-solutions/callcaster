import { describe, expect, test } from "vitest";

import { browserTimeZone, utcToWallClockHm, wallClockToUtcHm } from "../app/lib/schedule-timezone";

/**
 * These tests use fixed dates so DST offsets in the test runner's timezone
 * don't affect the assertions. "America/Toronto" (UTC-5 standard, UTC-4
 * DST) is used as the target zone since it's the product default.
 */
const TORONTO = "America/Toronto";

describe("wallClockToUtcHm", () => {
  test("converts wall time to UTC during standard time (January)", () => {
    // Toronto is UTC-5 in January.
    const at = new Date("2026-01-15T12:00:00Z");
    // 09:00 EST = 14:00 UTC
    expect(wallClockToUtcHm("09:00", TORONTO, at)).toBe("14:00");
    // 17:00 EST = 22:00 UTC
    expect(wallClockToUtcHm("17:00", TORONTO, at)).toBe("22:00");
  });

  test("converts wall time to UTC during DST (July)", () => {
    // Toronto is UTC-4 in July.
    const at = new Date("2026-07-15T12:00:00Z");
    // 09:00 EDT = 13:00 UTC
    expect(wallClockToUtcHm("09:00", TORONTO, at)).toBe("13:00");
    // 17:00 EDT = 21:00 UTC
    expect(wallClockToUtcHm("17:00", TORONTO, at)).toBe("21:00");
  });

  test("handles across-DST-boundary dates correctly", () => {
    // March 8 2026: DST starts March 8 at 2am (clocks spring forward).
    // Before transition (e.g. March 7): UTC-5
    const beforeDst = new Date("2026-03-07T12:00:00Z");
    expect(wallClockToUtcHm("09:00", TORONTO, beforeDst)).toBe("14:00");
    // After transition (e.g. March 9): UTC-4
    const afterDst = new Date("2026-03-09T12:00:00Z");
    expect(wallClockToUtcHm("09:00", TORONTO, afterDst)).toBe("13:00");
  });

  test("returns 00:00 for midnight wall time", () => {
    const at = new Date("2026-07-15T12:00:00Z");
    // 00:00 EDT = 04:00 UTC
    expect(wallClockToUtcHm("00:00", TORONTO, at)).toBe("04:00");
  });

  test("handles 23:59 wall time near midnight", () => {
    const at = new Date("2026-07-15T12:00:00Z");
    // 23:59 EDT = 03:59 UTC (next day in UTC for EDT)
    expect(wallClockToUtcHm("23:59", TORONTO, at)).toBe("03:59");
  });

  test("returns input unchanged for invalid format", () => {
    const at = new Date("2026-07-15T12:00:00Z");
    expect(wallClockToUtcHm("abc", TORONTO, at)).toBe("abc");
    expect(wallClockToUtcHm("", TORONTO, at)).toBe("");
  });

  test("works with default timezone (browser local)", () => {
    // No timeZone arg — uses Intl.DateTimeFormat().resolvedOptions().timeZone.
    // We can't predict the value, but it must be a valid HH:mm string.
    const at = new Date("2026-07-15T12:00:00Z");
    const result = wallClockToUtcHm("12:00", undefined, at);
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("utcToWallClockHm", () => {
  test("converts UTC time to wall time during standard time (January)", () => {
    const at = new Date("2026-01-15T12:00:00Z");
    // 14:00 UTC = 09:00 EST
    expect(utcToWallClockHm("14:00", TORONTO, at)).toBe("09:00");
    // 22:00 UTC = 17:00 EST
    expect(utcToWallClockHm("22:00", TORONTO, at)).toBe("17:00");
  });

  test("converts UTC time to wall time during DST (July)", () => {
    const at = new Date("2026-07-15T12:00:00Z");
    // 13:00 UTC = 09:00 EDT
    expect(utcToWallClockHm("13:00", TORONTO, at)).toBe("09:00");
    // 21:00 UTC = 17:00 EDT
    expect(utcToWallClockHm("21:00", TORONTO, at)).toBe("17:00");
  });

  test("roundtrip: wall → UTC → wall", () => {
    const at = new Date("2026-07-15T12:00:00Z");
    const inputs = ["09:00", "12:00", "17:00", "23:59", "00:00"];
    for (const wall of inputs) {
      const utc = wallClockToUtcHm(wall, TORONTO, at);
      const back = utcToWallClockHm(utc, TORONTO, at);
      expect(back).toBe(wall);
    }
  });

  test("roundtrip during standard time", () => {
    const at = new Date("2026-01-15T12:00:00Z");
    const inputs = ["09:00", "12:00", "17:00"];
    for (const wall of inputs) {
      const utc = wallClockToUtcHm(wall, TORONTO, at);
      const back = utcToWallClockHm(utc, TORONTO, at);
      expect(back).toBe(wall);
    }
  });

  test("returns empty string for empty input", () => {
    expect(utcToWallClockHm("", TORONTO)).toBe("");
  });

  test("returns input unchanged for invalid format", () => {
    expect(utcToWallClockHm("abc", TORONTO)).toBe("abc");
  });
});

describe("browserTimeZone (#969)", () => {
  test("returns the resolved IANA zone", () => {
    expect(browserTimeZone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  });
});
