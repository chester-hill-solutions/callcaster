import type { Schedule, ScheduleDay } from "@/lib/types";
import { nextScheduleOpenMs, scheduleIntervalAt } from "@/lib/schedule-intervals";

/**
 * Phase F — per-campaign SMS send windows.
 *
 * A send window reuses the existing weekly {@link Schedule} shape
 * (`{ day: { active, intervals: [{ start, end }] } }`) but describes *when a
 * campaign is allowed to dispatch SMS* rather than calling hours. It is stored
 * on `campaign.sms_send_window` (nullable jsonb). `null` / no active day means
 * unrestricted (send anytime).
 *
 * This module is campaign-only. 1:1 chat sends must never consult it.
 */

export const SEND_WINDOW_PRESET_IDS = [
  "business_hours",
  "evenings_weekends",
  "custom",
] as const;
export type SendWindowPresetId = (typeof SEND_WINDOW_PRESET_IDS)[number];

export const DEFAULT_SEND_WINDOW_PRESET: SendWindowPresetId = "custom";

const DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
export type SendWindowDayKey = (typeof DAY_KEYS)[number];

const WEEKDAYS: SendWindowDayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
];
const WEEKEND: SendWindowDayKey[] = ["saturday", "sunday"];

/** CASL: no marketing sends 9:00pm–8:00am recipient local time. */
export const CASL_QUIET_START_MINUTES = 21 * 60; // 21:00
export const CASL_QUIET_END_MINUTES = 8 * 60; // 08:00

function buildSchedule(
  entries: Partial<Record<SendWindowDayKey, { start: string; end: string }>>,
): Schedule {
  const schedule: Record<string, ScheduleDay> = {};
  for (const day of DAY_KEYS) {
    const interval = entries[day];
    schedule[day] = interval
      ? { active: true, intervals: [{ start: interval.start, end: interval.end }] }
      : { active: false, intervals: [] };
  }
  return schedule as unknown as Schedule;
}

export const BUSINESS_HOURS_SEND_WINDOW: Schedule = buildSchedule(
  Object.fromEntries(
    WEEKDAYS.map((day) => [day, { start: "09:00", end: "17:00" }]),
  ) as Partial<Record<SendWindowDayKey, { start: string; end: string }>>,
);

// Evenings on weekdays + daytime on weekends. Ends at 21:00 (the CASL quiet
// boundary) so this preset itself never trips the quiet-hours warning.
export const EVENINGS_WEEKENDS_SEND_WINDOW: Schedule = buildSchedule({
  ...(Object.fromEntries(
    WEEKDAYS.map((day) => [day, { start: "17:00", end: "21:00" }]),
  ) as Partial<Record<SendWindowDayKey, { start: string; end: string }>>),
  ...(Object.fromEntries(
    WEEKEND.map((day) => [day, { start: "10:00", end: "17:00" }]),
  ) as Partial<Record<SendWindowDayKey, { start: string; end: string }>>),
});

export function sendWindowPresetSchedule(
  id: SendWindowPresetId,
): Schedule | null {
  switch (id) {
    case "business_hours":
      return BUSINESS_HOURS_SEND_WINDOW;
    case "evenings_weekends":
      return EVENINGS_WEEKENDS_SEND_WINDOW;
    case "custom":
    default:
      return null;
  }
}

/** Minutes since midnight for "HH:mm"; null when malformed. */
function parseClockMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time).trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return hours * 60 + minutes;
}

/**
 * Normalize an arbitrary stored value (string JSON or object) into a Schedule
 * of active days with valid intervals. Returns `null` when nothing is active,
 * which callers treat as "unrestricted".
 */
export function parseSendWindow(value: unknown): Schedule | null {
  if (!value) return null;

  let raw: unknown = value;
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object") return null;

  const source = raw as Record<string, unknown>;
  const normalized: Record<string, ScheduleDay> = {};
  let hasActive = false;

  for (const day of DAY_KEYS) {
    const dayValue = source[day];
    if (!dayValue || typeof dayValue !== "object") {
      normalized[day] = { active: false, intervals: [] };
      continue;
    }
    const active = Boolean((dayValue as { active?: unknown }).active);
    const rawIntervals = (dayValue as { intervals?: unknown }).intervals;
    const intervals = Array.isArray(rawIntervals)
      ? rawIntervals.filter(
          (interval): interval is { start: string; end: string } =>
            Boolean(interval) &&
            typeof interval === "object" &&
            typeof (interval as { start?: unknown }).start === "string" &&
            typeof (interval as { end?: unknown }).end === "string" &&
            parseClockMinutes((interval as { start: string }).start) !== null &&
            parseClockMinutes((interval as { end: string }).end) !== null,
        )
      : [];

    if (active && intervals.length > 0) {
      hasActive = true;
      normalized[day] = { active: true, intervals };
    } else {
      normalized[day] = { active: false, intervals: [] };
    }
  }

  return hasActive ? (normalized as unknown as Schedule) : null;
}

/** Active intervals for a given weekday, in minutes since midnight. */
export function sendWindowActiveIntervals(
  schedule: Schedule | null | undefined,
  dayKey: SendWindowDayKey,
): Array<{ start: number; end: number }> {
  if (!schedule) return [];
  const day = (schedule as Record<string, ScheduleDay | undefined>)[dayKey];
  if (!day || !day.active) return [];
  return day.intervals
    .map((interval) => ({
      start: parseClockMinutes(interval.start),
      end: parseClockMinutes(interval.end),
    }))
    .filter(
      (interval): interval is { start: number; end: number } =>
        interval.start !== null && interval.end !== null,
    );
}

/**
 * Whether `now` falls inside the send window. A `null` window is unrestricted
 * (always true). Evaluated in UTC to match {@link checkSchedule} in
 * campaign.server, so the stored clock times are interpreted as workspace/UTC
 * wall time consistently with existing calling-hours enforcement. Uses the
 * shared interval projection (E2.1), so overnight tails from the previous day
 * and exact boundaries behave the same here as in next-open and ETA math.
 */
export function isWithinSendWindow(
  schedule: Schedule | null | undefined,
  now: Date = new Date(),
): boolean {
  const parsed = schedule ? parseSendWindow(schedule) : null;
  if (!parsed) return true;
  return scheduleIntervalAt(parsed, now.getTime()) !== null;
}

/** A week plus today's tail covers any weekly schedule. */
const NEXT_OPEN_LOOKAHEAD_DAYS = 8;

/**
 * The exact next instant the window allows sending, for scheduling a deferred
 * dispatch instead of a fixed polling interval. Returns `null` when the window
 * is unrestricted (nothing to wait for). Returns `now` when already inside.
 * Evaluated in UTC to match {@link isWithinSendWindow}.
 */
export function nextSendWindowOpenAt(
  schedule: Schedule | null | undefined,
  now: Date = new Date(),
): Date | null {
  const parsed = schedule ? parseSendWindow(schedule) : null;
  if (!parsed) return null;
  if (isWithinSendWindow(parsed, now)) return new Date(now);
  const openMs = nextScheduleOpenMs(parsed, now.getTime(), NEXT_OPEN_LOOKAHEAD_DAYS);
  return openMs === null ? null : new Date(openMs);
}

/**
 * CASL soft check: does any active interval overlap the 9pm–8am quiet window?
 * Returns the offending day keys so the UI can explain the warning.
 */
export function sendWindowQuietHoursOverlap(
  schedule: Schedule | null | undefined,
): { overlaps: boolean; days: SendWindowDayKey[] } {
  const parsed = schedule ? parseSendWindow(schedule) : null;
  if (!parsed) return { overlaps: false, days: [] };

  const days: SendWindowDayKey[] = [];
  for (const dayKey of DAY_KEYS) {
    const intervals = sendWindowActiveIntervals(parsed, dayKey);
    const overlaps = intervals.some(({ start, end }) => {
      if (end <= start) return true; // overnight interval always spans quiet time
      return start < CASL_QUIET_END_MINUTES || end > CASL_QUIET_START_MINUTES;
    });
    if (overlaps) days.push(dayKey);
  }
  return { overlaps: days.length > 0, days };
}

/** Best-effort detection of which preset a stored window matches. */
export function detectSendWindowPreset(
  schedule: Schedule | null | undefined,
): SendWindowPresetId {
  const parsed = parseSendWindow(schedule);
  if (!parsed) return "custom";
  if (schedulesEqual(parsed, BUSINESS_HOURS_SEND_WINDOW)) return "business_hours";
  if (schedulesEqual(parsed, EVENINGS_WEEKENDS_SEND_WINDOW)) {
    return "evenings_weekends";
  }
  return "custom";
}

function schedulesEqual(a: Schedule, b: Schedule): boolean {
  for (const day of DAY_KEYS) {
    const left = sendWindowActiveIntervals(a, day);
    const right = sendWindowActiveIntervals(b, day);
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i++) {
      const leftInterval = left[i];
      const rightInterval = right[i];
      if (!leftInterval || !rightInterval) {
        throw new Error(
          "schedulesEqual: interval index out of range despite equal-length check",
        );
      }
      if (
        leftInterval.start !== rightInterval.start ||
        leftInterval.end !== rightInterval.end
      ) {
        return false;
      }
    }
  }
  return true;
}
