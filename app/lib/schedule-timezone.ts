/**
 * Timezone-aware conversion between wall-clock time (user's local time)
 * and UTC clock time for campaign schedule intervals.
 *
 * The UI stores calling hours as UTC HH:mm strings so `checkSchedule` can
 * evaluate them against a UTC clock. Conversions must handle DST correctly:
 * a wall-clock time like 09:00 maps to different UTC offsets depending on
 * whether DST is in effect on the intended date.
 */

import { logger } from "@/lib/logger.client";

const HM_RE = /^(\d{1,2}):(\d{2})$/;

function timezoneOffsetMillis(timeZone: string, date: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    parts.hour === "24" ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

/**
 * Convert a wall-clock time (e.g. "09:00" in the user's timezone) to a UTC
 * HH:mm string suitable for storing in `campaign.schedule`.
 *
 * The conversion is anchored to `at` (defaults to now) so that the offset
 * reflects the DST state of the intended date. For a schedule that spans DST
 * transitions, each interval may store a slightly different UTC offset — this
 * is correct because `checkSchedule` evaluates all intervals in UTC regardless.
 */
export function wallClockToUtcHm(
  wallHm: string,
  timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
  at: Date = new Date(),
): string {
  const match = HM_RE.exec(wallHm.trim());
  if (!match) {
    logger.error("Invalid wall-clock time:", wallHm);
    return wallHm;
  }
  const wallHour = Number(match[1]);
  const wallMinute = Number(match[2]);

  const dateParts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(at)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  const year = Number(dateParts.year);
  const month = Number(dateParts.month);
  const day = Number(dateParts.day);

  let utcMillis = Date.UTC(year, month - 1, day, wallHour, wallMinute, 0, 0);
  for (let i = 0; i < 2; i += 1) {
    const offsetMillis = timezoneOffsetMillis(timeZone, new Date(utcMillis));
    utcMillis =
      Date.UTC(year, month - 1, day, wallHour, wallMinute, 0, 0) - offsetMillis;
  }

  const corrected = new Date(utcMillis);
  return `${String(corrected.getUTCHours()).padStart(2, "0")}:${String(
    corrected.getUTCMinutes(),
  ).padStart(2, "0")}`;
}

/**
 * Convert a UTC HH:mm string (as stored in `campaign.schedule`) back to a
 * wall-clock HH:mm string in the user's timezone for display.
 */
export function utcToWallClockHm(
  utcHm: string,
  timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
  at: Date = new Date(),
): string {
  if (!utcHm) return "";
  const match = HM_RE.exec(utcHm.trim());
  if (!match) {
    logger.error("Invalid UTC time:", utcHm);
    return utcHm;
  }
  const utcHour = Number(match[1]);
  const utcMinute = Number(match[2]);

  const utcDate = Date.UTC(
    at.getFullYear(),
    at.getMonth(),
    at.getDate(),
    utcHour,
    utcMinute,
    0,
    0,
  );
  const localDate = new Date(utcDate);

  // Convert from the local timezone representation back to intended wall time
  // by finding what wall-clock time in the target zone aligns with this UTC instant.
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(localDate)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  return `${parts.hour ?? "00"}:${parts.minute ?? "00"}`;
}
