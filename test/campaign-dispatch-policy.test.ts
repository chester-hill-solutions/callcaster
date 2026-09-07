import { describe, expect, test } from "vitest";

import {
  isDispatchAllowedAt,
  ivrCallingPolicy,
  nextDispatchOpenAt,
  projectDispatchTime,
  smsSendPolicy,
} from "@/lib/campaign-dispatch-policy";
import { checkSchedule } from "@/lib/database/campaign.server";
import { estimateOutboundCompletion } from "@/lib/campaign-outbound-estimate";

// Roadmap E2.2: one SMS policy and one IVR policy over the shared engine.
// 2026-09-06 is a Sunday; all UTC.
const SUNDAY_0000 = Date.UTC(2026, 8, 6);
const HOUR = 60 * 60 * 1000;
const at = (h: number) => new Date(SUNDAY_0000 + h * HOUR);

const sundayHours = (intervals: Array<[string, string]>) => ({
  sunday: { active: true, intervals: intervals.map(([start, end]) => ({ start, end })) },
});

describe("smsSendPolicy", () => {
  test("no window means send any time, and nothing to wait for", () => {
    const policy = smsSendPolicy({ sms_send_window: null });
    expect(isDispatchAllowedAt(policy, at(3))).toBe(true);
    expect(nextDispatchOpenAt(policy, at(3))).toBeNull();
  });

  test("a window gates sending and reports the next open", () => {
    const policy = smsSendPolicy({ sms_send_window: sundayHours([["09:00", "12:00"]]) });
    expect(isDispatchAllowedAt(policy, at(8))).toBe(false);
    expect(nextDispatchOpenAt(policy, at(8))?.getTime()).toBe(SUNDAY_0000 + 9 * HOUR);
    expect(isDispatchAllowedAt(policy, at(10))).toBe(true);
  });
});

describe("ivrCallingPolicy", () => {
  const dates = { start_date: "2026-09-01T00:00:00Z", end_date: "2026-09-30T23:59:59Z" };

  test("no schedule means never", () => {
    expect(isDispatchAllowedAt(ivrCallingPolicy({ schedule: null, ...dates }), at(10))).toBe(false);
    expect(checkSchedule({ schedule: null, ...dates })).toBe(false);
  });

  test("calling hours gate dialing; a zero-length interval is inactive", () => {
    const policy = ivrCallingPolicy({ schedule: sundayHours([["09:00", "12:00"], ["14:00", "14:00"]]), ...dates });
    expect(isDispatchAllowedAt(policy, at(10))).toBe(true);
    expect(isDispatchAllowedAt(policy, at(14))).toBe(false);
    expect(isDispatchAllowedAt(policy, at(13))).toBe(false);
  });

  test("dates bound the calling hours, end date inclusive, and a JSON-string schedule is accepted", () => {
    const schedule = JSON.stringify(sundayHours([["00:00", "23:59"]]));
    expect(isDispatchAllowedAt(ivrCallingPolicy({ schedule, start_date: "2026-09-07T00:00:00Z", end_date: dates.end_date }), at(10))).toBe(false);
    expect(isDispatchAllowedAt(ivrCallingPolicy({ schedule, start_date: dates.start_date, end_date: "2026-09-06T10:00:00Z" }), at(10))).toBe(true);
    expect(isDispatchAllowedAt(ivrCallingPolicy({ schedule, start_date: dates.start_date, end_date: "2026-09-06T09:59:59Z" }), at(10))).toBe(false);
  });

  test("next open waits for the start date and gives up past the end date", () => {
    const schedule = sundayHours([["09:00", "12:00"]]);
    const notYet = ivrCallingPolicy({ schedule, start_date: "2026-09-13T00:00:00Z", end_date: "2026-09-30T00:00:00Z" });
    expect(nextDispatchOpenAt(notYet, at(10))?.getTime()).toBe(Date.UTC(2026, 8, 13, 9));
    const over = ivrCallingPolicy({ schedule, start_date: "2026-09-01T00:00:00Z", end_date: "2026-09-06T08:00:00Z" });
    expect(nextDispatchOpenAt(over, at(8.5))).toBeNull();
  });
});

describe("ETA through the policy", () => {
  test("IVR ETA starts at the campaign start date and reports overflow past the end date", () => {
    const schedule = { sunday: { active: true, intervals: [{ start: "09:00", end: "10:00" }] } };
    const later = ivrCallingPolicy({ schedule, start_date: "2026-09-13T00:00:00Z", end_date: "2026-09-30T00:00:00Z" });
    const projection = projectDispatchTime(later, at(0), 30 * 60);
    expect(projection).toEqual({ kind: "finish", finishMs: Date.UTC(2026, 8, 13, 9, 30) });

    const tight = ivrCallingPolicy({ schedule, start_date: "2026-09-01T00:00:00Z", end_date: "2026-09-06T09:15:00Z" });
    const estimate = estimateOutboundCompletion({ queueCount: 1800, ratePerSecond: 1, now: at(0), policy: tight });
    expect(estimate?.exceedsEndDate).toBe(true);
    expect(estimate?.slowFinish.getTime()).toBe(Date.UTC(2026, 8, 6, 9, 15));
  });

  test("SMS ETA without a window is continuous", () => {
    const estimate = estimateOutboundCompletion({ queueCount: 60, ratePerSecond: 1, now: at(0), policy: smsSendPolicy({}) });
    expect(estimate?.averageFinish.getTime()).toBe(SUNDAY_0000 + 60 * 1000);
    expect(estimate?.exceedsEndDate).toBe(false);
  });
});
