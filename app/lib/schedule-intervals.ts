import type { Schedule, ScheduleDay } from "@/lib/types";

/**
 * Pure weekly-schedule projector (roadmap E2.1).
 *
 * A {@link Schedule} stores wall-clock intervals per weekday. Every consumer
 * used to walk that shape itself — send-window eligibility, next-open
 * scheduling, and ETA projection each re-implemented "which day, which
 * interval, does it wrap midnight". This module turns a schedule into
 * absolute UTC intervals once, so those questions become interval arithmetic.
 *
 * Wall-clock times are interpreted as UTC, matching the existing
 * calling-hours enforcement. Interval starts are inclusive and ends are
 * exclusive; an interval whose end is not after its start wraps into the
 * next day (`end === start` means a full day). Overlapping or touching
 * intervals are merged, so the projection is deterministic regardless of how
 * the schedule was authored. No UI, database, or clock dependencies.
 */

export type AbsoluteInterval = {
  /** Inclusive start, ms since epoch (UTC). */
  startMs: number;
  /** Exclusive end, ms since epoch (UTC). */
  endMs: number;
};

const DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export const MS_PER_MINUTE = 60 * 1000;
export const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;
const MINUTES_PER_DAY = 24 * 60;

function parseClockMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Active intervals for a weekday, in minutes since midnight (unparsed ones are dropped). */
export function scheduleDayIntervals(
  schedule: Schedule | null | undefined,
  dayIndex: number,
): Array<{ start: number; end: number }> {
  if (!schedule) return [];
  const key = DAY_KEYS[dayIndex];
  if (!key) return [];
  const day = (schedule as Record<string, ScheduleDay | undefined>)[key];
  if (!day || !day.active || !Array.isArray(day.intervals)) return [];
  const out: Array<{ start: number; end: number }> = [];
  for (const interval of day.intervals) {
    const start = parseClockMinutes(String(interval.start ?? ""));
    const end = parseClockMinutes(String(interval.end ?? ""));
    if (start === null || end === null) continue;
    out.push({ start, end });
  }
  return out;
}

/** Whether the schedule has any active day with at least one parseable interval. */
export function scheduleHasActiveTime(schedule: Schedule | null | undefined): boolean {
  for (let day = 0; day < 7; day++) {
    if (scheduleDayIntervals(schedule, day).length > 0) return true;
  }
  return false;
}

function utcMidnight(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function mergeIntervals(intervals: AbsoluteInterval[]): AbsoluteInterval[] {
  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const merged: AbsoluteInterval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.startMs <= last.endMs) {
      if (interval.endMs > last.endMs) last.endMs = interval.endMs;
      continue;
    }
    merged.push({ ...interval });
  }
  return merged;
}

/**
 * Absolute UTC intervals the schedule allows, ordered and merged, covering
 * `days` days starting at the UTC midnight of `fromMs`. The previous day is
 * always walked too, so an overnight interval that began before `fromMs` and
 * is still running is included. Intervals that ended at or before `fromMs`
 * are dropped; the one containing `fromMs` is kept whole.
 *
 * An unrestricted (`null`) or empty schedule projects to no intervals; callers
 * decide what that means for them.
 */
export function projectScheduleIntervals(
  schedule: Schedule | null | undefined,
  fromMs: number,
  days: number,
): AbsoluteInterval[] {
  if (!schedule || days <= 0) return [];
  const baseMidnightMs = utcMidnight(fromMs);
  const raw: AbsoluteInterval[] = [];
  for (let offset = -1; offset < days; offset++) {
    const dayStartMs = baseMidnightMs + offset * MS_PER_DAY;
    const dayIndex = new Date(dayStartMs).getUTCDay();
    for (const { start, end } of scheduleDayIntervals(schedule, dayIndex)) {
      const spanMinutes = end > start ? end - start : end + MINUTES_PER_DAY - start;
      const startMs = dayStartMs + start * MS_PER_MINUTE;
      raw.push({ startMs, endMs: startMs + spanMinutes * MS_PER_MINUTE });
    }
  }
  return mergeIntervals(raw).filter((interval) => interval.endMs > fromMs);
}

/** The interval containing `atMs` (start inclusive, end exclusive), if any. */
export function scheduleIntervalAt(
  schedule: Schedule | null | undefined,
  atMs: number,
): AbsoluteInterval | null {
  for (const interval of projectScheduleIntervals(schedule, atMs, 1)) {
    if (interval.startMs <= atMs && atMs < interval.endMs) return interval;
    if (interval.startMs > atMs) break;
  }
  return null;
}

/** The first interval start strictly after `atMs` within `days` days, if any. */
export function nextScheduleOpenMs(
  schedule: Schedule | null | undefined,
  atMs: number,
  days: number,
): number | null {
  for (const interval of projectScheduleIntervals(schedule, atMs, days)) {
    if (interval.startMs > atMs) return interval.startMs;
  }
  return null;
}

/**
 * Walk forward from `fromMs`, consuming `neededSeconds` of in-schedule time,
 * and return the instant it is used up — or `null` when the lookahead has too
 * little active time. Time before `fromMs` inside the current interval is not
 * counted.
 */
export function consumeScheduleTime(
  schedule: Schedule | null | undefined,
  fromMs: number,
  neededSeconds: number,
  days: number,
): number | null {
  let remaining = neededSeconds;
  for (const interval of projectScheduleIntervals(schedule, fromMs, days)) {
    const effectiveStartMs = Math.max(interval.startMs, fromMs);
    const availableSeconds = (interval.endMs - effectiveStartMs) / 1000;
    if (availableSeconds <= 0) continue;
    if (availableSeconds >= remaining) return effectiveStartMs + remaining * 1000;
    remaining -= availableSeconds;
  }
  return null;
}
