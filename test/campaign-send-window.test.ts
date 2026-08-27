/**
 * nextSendWindowOpenAt: the exact instant a deferred send-window dispatch
 * should resume (#1352). Pairs with isWithinSendWindow's UTC semantics.
 */
import { describe, expect, test } from "vitest";

import {
  BUSINESS_HOURS_SEND_WINDOW,
  nextSendWindowOpenAt,
  parseSendWindow,
  type SendWindowDayKey,
} from "@/lib/campaign-send-window";
import type { Schedule } from "@/lib/types";

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

/** Monday 2026-08-24 in UTC. */
function utcAt(dayOffset: number, hours: number, minutes: number): Date {
  const base = Date.UTC(2026, 7, 24) + dayOffset * MS_PER_DAY;
  return new Date(base + (hours * 60 + minutes) * MS_PER_MINUTE);
}

function windowFor(
  entries: Partial<Record<SendWindowDayKey, { start: string; end: string }>>,
): Schedule {
  return parseSendWindow(
    Object.fromEntries(
      Object.entries(entries).map(([day, interval]) => [
        day,
        { active: true, intervals: [interval] },
      ]),
    ),
  ) as Schedule;
}

describe("nextSendWindowOpenAt", () => {
  test("an unrestricted window has nothing to wait for", () => {
    expect(nextSendWindowOpenAt(null, utcAt(0, 10, 0))).toBeNull();
    expect(nextSendWindowOpenAt(undefined, utcAt(0, 10, 0))).toBeNull();
  });

  test("a malformed window is unrestricted", () => {
    expect(nextSendWindowOpenAt("not json" as unknown as Schedule, utcAt(0, 10, 0))).toBeNull();
  });

  test("inside the window returns now", () => {
    // Monday 10:00 with a 09:00-17:00 business-hours window.
    const now = utcAt(0, 10, 0);
    expect(nextSendWindowOpenAt(BUSINESS_HOURS_SEND_WINDOW, now)).toEqual(now);
  });

  test("before today's open returns today at the boundary", () => {
    // Monday 07:00, business hours open 09:00.
    const open = nextSendWindowOpenAt(BUSINESS_HOURS_SEND_WINDOW, utcAt(0, 7, 0));
    expect(open).toEqual(utcAt(0, 9, 0));
  });

  test("after today's close rolls to the next active day", () => {
    // Friday 18:00 (business hours closed 17:00) → Monday 09:00.
    expect(nextSendWindowOpenAt(BUSINESS_HOURS_SEND_WINDOW, utcAt(4, 18, 0))).toEqual(
      utcAt(7, 9, 0),
    );
  });

  test("a non-active day skips forward", () => {
    // Saturday 12:00 with a weekday-only custom window (Mon 09:00-10:00).
    const schedule = windowFor({ monday: { start: "09:00", end: "10:00" } });
    // 2026-08-24 is a Monday, so +5 days is Saturday; next open is the
    // following Monday (+7).
    expect(nextSendWindowOpenAt(schedule, utcAt(5, 12, 0))).toEqual(utcAt(7, 9, 0));
  });

  test("an overnight interval opens at its start minute", () => {
    // Tue 22:00 → Wed 06:00. At Wed 01:00 we are inside (overnight tail).
    const schedule = windowFor({
      tuesday: { start: "22:00", end: "06:00" },
    });
    const inside = nextSendWindowOpenAt(schedule, utcAt(2, 1, 0));
    expect(inside).toEqual(utcAt(2, 1, 0));
    // After the tail closes Wednesday 06:00, next open is Tuesday 22:00 again.
    const after = nextSendWindowOpenAt(schedule, utcAt(2, 8, 0));
    expect(after).toEqual(utcAt(8, 22, 0));
  });

  test("minutes are respected, not just hours", () => {
    // The #1352 shape: window opens 15:05, dispatch ticks at 15:00.
    const schedule = windowFor({ monday: { start: "15:05", end: "21:00" } });
    expect(nextSendWindowOpenAt(schedule, utcAt(0, 15, 0))).toEqual(utcAt(0, 15, 5));
  });
});
