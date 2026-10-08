import { describe, expect, test } from "vitest";
import { getCampaignReadiness, getScheduleValidation } from "@/lib/campaign-readiness";
import type { Campaign, MessageCampaign } from "@/lib/types";

const campaign = {
  type: "message", caller_id: "+15555550100", sms_send_window: null,
  start_date: "2026-10-06T12:00:00Z", end_date: "2026-10-07T12:00:00Z",
} as Campaign;
const details = { body_text: "Send-window fixture", message_media: [] } as MessageCampaign;
const options = { queueCount: 1, now: new Date("2026-10-05T12:00:00Z") };
const valid = { monday: { active: true, intervals: [{ start: "09:00", end: "17:00" }] } };

describe("unrestricted SMS warnings", () => {
  test.each([{ schedule: null }, { schedule: valid }])(
    "warns without disabling null-window launch: $schedule",
    ({ schedule }) => {
      const result = getCampaignReadiness({ ...campaign, schedule } as Campaign, details, options);
      expect(result.warnings).toEqual([
        expect.objectContaining({ code: "send_window_unrestricted", message: expect.stringMatching(/any hour.*overnight/i) }),
      ]);
      expect(result.issues).toEqual([]);
      expect(result.startDisabledReason).toBeNull();
      expect(result.scheduleDisabledReason).toBeNull();
      if (schedule) expect(result.warnings[0].message).toMatch(/voice.*not.*SMS/i);
    },
  );

  test("a saved valid SMS window removes the warning", () => {
    const result = getCampaignReadiness({ ...campaign, sms_send_window: valid } as Campaign, details, options);
    expect(result.warnings).toEqual([]);
    expect(result.startDisabledReason).toBeNull();
  });

  test("voice hours do not disable an unrestricted SMS campaign", () => {
    const result = getCampaignReadiness({ ...campaign, schedule: { monday: { active: true, intervals: [] } } } as Campaign, details, options);
    expect(result.startDisabledReason).toBeNull();
    expect(result.warnings[0].code).toBe("send_window_unrestricted");
  });

  test("an unrelated hard guard still blocks", () => {
    const result = getCampaignReadiness(campaign, details, { ...options, queueCount: 0 });
    expect(result.startDisabledReason).toBe("Add at least one contact before starting or scheduling");
    expect(result.warnings).toHaveLength(1);
  });
});

describe("raw active interval validation", () => {
  test.each([
    { interval: { start: "18:00" } },
    { interval: { start: "18:00", end: null } },
    { interval: { start: "18:00", end: "26:00" } },
    { interval: { start: "18:00", end: "18:00" } },
    { interval: null },
  ])("valid siblings cannot hide $interval", ({ interval }) => {
    const schedule = { monday: { active: true, intervals: [...valid.monday.intervals, interval] } };
    for (const input of [schedule, JSON.stringify(schedule)]) {
      const result = getScheduleValidation(input as Campaign["schedule"]);
      expect(result.hasCallingHours).toBe(true);
      expect(result.hasInvalidIntervals).toBe(true);
    }
  });

  test("an incomplete SMS interval blocks readiness", () => {
    const window = { monday: { active: true, intervals: [...valid.monday.intervals, { start: "18:00" }] } };
    const result = getCampaignReadiness({ ...campaign, sms_send_window: window } as Campaign, details, options);
    expect(result.issues.map(x => x.code)).toContain("invalid_intervals");
    expect(result.startDisabledReason).not.toBeNull();
  });

  test("inactive incomplete intervals do not block a valid day", () => {
    const result = getScheduleValidation({ ...valid, tuesday: { active: false, intervals: [{ start: "18:00" }] } } as Campaign["schedule"]);
    expect(result).toEqual({ hasCallingHours: true, hasInvalidIntervals: false });
  });

  test("valid overnight voice intervals remain permitted", () => {
    expect(getScheduleValidation({ monday: { active: true, intervals: [{ start: "23:00", end: "02:00" }] } })).toEqual({ hasCallingHours: true, hasInvalidIntervals: false });
  });
});
