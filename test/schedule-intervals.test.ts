import { describe, expect, test } from "vitest";

import {
  consumeScheduleTime,
  nextScheduleOpenMs,
  projectScheduleIntervals,
  scheduleHasActiveTime,
  scheduleIntervalAt,
} from "@/lib/schedule-intervals";
import { isWithinSendWindow, nextSendWindowOpenAt } from "@/lib/campaign-send-window";
import type { Schedule } from "@/lib/types";

// Roadmap E2.1: one absolute-interval projection behind eligibility, next-open,
// and ETA math. All times UTC; 2026-09-06 is a Sunday.
const SUNDAY_0000 = Date.UTC(2026, 8, 6, 0, 0);
const HOUR = 60 * 60 * 1000;

function schedule(days: Record<string, Array<[string, string]>>): Schedule {
  const out: Record<string, { active: boolean; intervals: Array<{ start: string; end: string }> }> = {};
  for (const day of ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]) {
    const intervals = days[day] ?? [];
    out[day] = { active: intervals.length > 0, intervals: intervals.map(([start, end]) => ({ start, end })) };
  }
  return out as unknown as Schedule;
}

describe("projectScheduleIntervals", () => {
  test("an overnight interval that started the previous day is included", () => {
    const s = schedule({ saturday: [["22:00", "02:00"]] });
    const at = SUNDAY_0000 + 1 * HOUR; // Sunday 01:00, inside Saturday's tail
    const [first] = projectScheduleIntervals(s, at, 1);
    expect(first).toEqual({ startMs: SUNDAY_0000 - 2 * HOUR, endMs: SUNDAY_0000 + 2 * HOUR });
    expect(scheduleIntervalAt(s, at)).not.toBeNull();
    expect(isWithinSendWindow(s, new Date(at))).toBe(true);
  });

  test("week rollover: a Sunday interval is reached from Saturday", () => {
    const s = schedule({ sunday: [["09:00", "10:00"]] });
    const saturdayNoon = SUNDAY_0000 - 12 * HOUR;
    expect(nextScheduleOpenMs(s, saturdayNoon, 8)).toBe(SUNDAY_0000 + 9 * HOUR);
    expect(nextSendWindowOpenAt(s, new Date(saturdayNoon))?.getTime()).toBe(SUNDAY_0000 + 9 * HOUR);
  });

  test("multiple intervals per day stay separate and ordered", () => {
    const s = schedule({ sunday: [["13:00", "14:00"], ["09:00", "10:00"]] });
    const intervals = projectScheduleIntervals(s, SUNDAY_0000, 1);
    expect(intervals).toEqual([
      { startMs: SUNDAY_0000 + 9 * HOUR, endMs: SUNDAY_0000 + 10 * HOUR },
      { startMs: SUNDAY_0000 + 13 * HOUR, endMs: SUNDAY_0000 + 14 * HOUR },
    ]);
  });

  test("overlapping and touching intervals merge deterministically", () => {
    const a = schedule({ sunday: [["09:00", "12:00"], ["11:00", "14:00"], ["14:00", "15:00"]] });
    const b = schedule({ sunday: [["14:00", "15:00"], ["11:00", "14:00"], ["09:00", "12:00"]] });
    const expected = [{ startMs: SUNDAY_0000 + 9 * HOUR, endMs: SUNDAY_0000 + 15 * HOUR }];
    expect(projectScheduleIntervals(a, SUNDAY_0000, 1)).toEqual(expected);
    expect(projectScheduleIntervals(b, SUNDAY_0000, 1)).toEqual(expected);
  });

  test("unrestricted and empty schedules project to nothing", () => {
    expect(projectScheduleIntervals(null, SUNDAY_0000, 7)).toEqual([]);
    expect(projectScheduleIntervals(schedule({}), SUNDAY_0000, 7)).toEqual([]);
    expect(scheduleHasActiveTime(schedule({}))).toBe(false);
    expect(isWithinSendWindow(null, new Date(SUNDAY_0000))).toBe(true);
    expect(nextSendWindowOpenAt(null, new Date(SUNDAY_0000))).toBeNull();
  });

  test("boundaries: start is inside, end is outside, midnight belongs to the day that starts", () => {
    const s = schedule({ sunday: [["09:00", "10:00"]], monday: [["00:00", "01:00"]] });
    expect(scheduleIntervalAt(s, SUNDAY_0000 + 9 * HOUR)).not.toBeNull();
    expect(scheduleIntervalAt(s, SUNDAY_0000 + 10 * HOUR)).toBeNull();
    expect(scheduleIntervalAt(s, SUNDAY_0000 + 10 * HOUR - 1)).not.toBeNull();
    const mondayMidnight = SUNDAY_0000 + 24 * HOUR;
    expect(scheduleIntervalAt(s, mondayMidnight)).not.toBeNull();
    expect(scheduleIntervalAt(s, mondayMidnight - 1)).toBeNull();
  });

  test("a full-day interval (end equals start) wraps the whole day", () => {
    const s = schedule({ sunday: [["08:00", "08:00"]] });
    expect(projectScheduleIntervals(s, SUNDAY_0000, 1)).toEqual([
      { startMs: SUNDAY_0000 + 8 * HOUR, endMs: SUNDAY_0000 + 32 * HOUR },
    ]);
  });
});

describe("consumeScheduleTime", () => {
  test("does not count time already elapsed inside the current interval", () => {
    const s = schedule({ sunday: [["09:00", "10:00"]], monday: [["09:00", "10:00"]] });
    const at = SUNDAY_0000 + 9.5 * HOUR;
    // 30 min left on Sunday, then Monday 09:00 + 30 min.
    expect(consumeScheduleTime(s, at, 60 * 60, 8)).toBe(SUNDAY_0000 + 24 * HOUR + 9.5 * HOUR);
  });

  test("returns null when the lookahead cannot supply the time", () => {
    const s = schedule({ sunday: [["09:00", "10:00"]] });
    expect(consumeScheduleTime(s, SUNDAY_0000, 10 * 60 * 60, 1)).toBeNull();
  });
});
