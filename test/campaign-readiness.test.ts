import { describe, expect, test } from "vitest";

import { getCampaignReadiness } from "../app/lib/campaign-readiness";

const validSchedule = {
  monday: {
    active: true,
    intervals: [{ start: "13:00", end: "21:00" }],
  },
};

describe("app/lib/campaign-readiness.ts", () => {
  test("requires queued contacts before start or schedule", () => {
    const readiness = getCampaignReadiness(
      {
        type: "message",
        caller_id: "+15555550100",
        start_date: "2026-03-10T10:00:00.000Z",
        end_date: "2026-03-11T10:00:00.000Z",
        schedule: validSchedule,
      } as any,
      {
        body_text: "Hello there",
        message_media: [],
      } as any,
      { queueCount: 0 },
    );

    expect(readiness.startDisabledReason).toBe(
      "Add at least one contact before starting or scheduling",
    );
    expect(readiness.scheduleIssues).toContain(
      "Add at least one contact before starting or scheduling",
    );
  });

  test("accepts overnight windows and UTC-shifted same-calendar-day spans", () => {
    const overnight = getCampaignReadiness(
      {
        type: "message",
        caller_id: "+15555550100",
        start_date: "2026-03-10T10:00:00.000Z",
        end_date: "2026-03-11T10:00:00.000Z",
        schedule: {
          monday: {
            active: true,
            intervals: [{ start: "23:00", end: "02:00" }],
          },
        },
      } as any,
      {
        body_text: "Hello there",
        message_media: [],
      } as any,
      { queueCount: 1 },
    );

    expect(overnight.startIssues).not.toContain(
      "Each active calling day needs at least one valid time window",
    );
    expect(overnight.startIssues).not.toContain("Calling hours are required");

    const utcSpan = getCampaignReadiness(
      {
        type: "message",
        caller_id: "+15555550100",
        start_date: "2026-03-10T10:00:00.000Z",
        end_date: "2026-03-11T10:00:00.000Z",
        schedule: {
          monday: {
            active: true,
            intervals: [{ start: "05:00", end: "04:59" }],
          },
        },
      } as any,
      {
        body_text: "Hello there",
        message_media: [],
      } as any,
      { queueCount: 1 },
    );

    expect(utcSpan.startIssues).not.toContain(
      "Each active calling day needs at least one valid time window",
    );
    expect(utcSpan.startIssues).not.toContain("Calling hours are required");
  });

  test("flags invalid date order and invalid active schedule intervals", () => {
    const readiness = getCampaignReadiness(
      {
        type: "message",
        caller_id: "+15555550100",
        start_date: "2026-03-11T10:00:00.000Z",
        end_date: "2026-03-10T10:00:00.000Z",
        schedule: {
          monday: {
            active: true,
            intervals: [{ start: "13:00", end: "13:00" }],
          },
        },
      } as any,
      {
        body_text: "Hello there",
        message_media: [],
      } as any,
      { queueCount: 1 },
    );

    expect(readiness.startIssues).toContain(
      "Start date must be before the end date",
    );
    expect(readiness.startIssues).toContain(
      "Each active calling day needs at least one valid time window",
    );
  });

  test("marks a complete campaign as ready", () => {
    const readiness = getCampaignReadiness(
      {
        type: "message",
        caller_id: "+15555550100",
        start_date: "2026-03-10T10:00:00.000Z",
        end_date: "2026-03-11T10:00:00.000Z",
        schedule: validSchedule,
      } as any,
      {
        body_text: "Hello there",
        message_media: [],
      } as any,
      { queueCount: 2 },
    );

    expect(readiness.startIssues).toEqual([]);
    expect(readiness.scheduleDisabledReason).toBeNull();
  });

  test("returns load errors when campaign is missing", () => {
    const readiness = getCampaignReadiness(null, null, {});
    expect(readiness.startDisabledReason).toBe("Campaign could not be loaded");
    expect(readiness.scheduleIssues).toEqual(["Campaign could not be loaded"]);
  });

  test("validates required fields and invalid dates/schedule JSON", () => {
    const readiness = getCampaignReadiness(
      {
        type: null,
        caller_id: null,
        start_date: "bad-date",
        end_date: "also-bad",
        schedule: "{bad",
      } as any,
      null,
      { queueCount: 0 },
    );

    expect(readiness.startIssues).toContain("Campaign type is required");
    expect(readiness.startIssues).toContain(
      "An outbound phone number is required",
    );
    expect(readiness.startIssues).toContain(
      "Start and end dates must be valid",
    );
    expect(readiness.startIssues).toContain("Calling hours are required");
    expect(readiness.startIssues).toContain(
      "Add at least one contact before starting or scheduling",
    );
  });

  test("accepts message campaigns with media-only content", () => {
    const readiness = getCampaignReadiness(
      {
        type: "message",
        caller_id: "+15555550100",
        start_date: "2026-03-10T10:00:00.000Z",
        end_date: "2026-03-11T10:00:00.000Z",
        schedule: validSchedule,
      } as any,
      {
        body_text: "",
        message_media: ["x.png"],
      } as any,
      { queueCount: 1 },
    );

    expect(readiness.startIssues).toEqual([]);
  });

  test("requires script for non-message campaigns", () => {
    const readiness = getCampaignReadiness(
      {
        type: "live",
        caller_id: "+15555550100",
        start_date: "2026-03-10T10:00:00.000Z",
        end_date: "2026-03-11T10:00:00.000Z",
        schedule: validSchedule,
      } as any,
      {
        script_id: null,
      } as any,
      { queueCount: 1 },
    );

    expect(readiness.startIssues).toContain("Script is required");
  });

  test("flags missing dates and missing calling hours for empty schedule", () => {
    const readiness = getCampaignReadiness(
      {
        type: "message",
        caller_id: "+15555550100",
        start_date: null,
        end_date: null,
        schedule: null,
      } as any,
      {
        body_text: "Hello",
        message_media: [],
      } as any,
      { queueCount: 1 },
    );

    expect(readiness.startIssues).toContain("Start and end dates are required");
    expect(readiness.startIssues).toContain("Calling hours are required");
    expect(readiness.startIssues).not.toContain(
      "Start and end dates must be valid",
    );
  });

  test("treats malformed schedule entries as no calling hours", () => {
    const readiness = getCampaignReadiness(
      {
        type: "message",
        caller_id: "+15555550100",
        start_date: "2026-03-10T10:00:00.000Z",
        end_date: "2026-03-11T10:00:00.000Z",
        schedule: {
          monday: { intervals: [{ start: "09:00", end: "17:00" }] },
          tuesday: null,
        },
      } as any,
      {
        body_text: "Hello",
        message_media: [],
      } as any,
      { queueCount: 1 },
    );

    expect(readiness.startIssues).toContain("Calling hours are required");
  });

  test("marks active day with empty intervals as invalid window", () => {
    const readiness = getCampaignReadiness(
      {
        type: "message",
        caller_id: "+15555550100",
        start_date: "2026-03-10T10:00:00.000Z",
        end_date: "2026-03-11T10:00:00.000Z",
        schedule: {
          monday: { active: true, intervals: [] },
          tuesday: {
            active: false,
            intervals: [{ start: "09:00", end: "17:00" }],
          },
        },
      } as any,
      {
        body_text: "Hello",
        message_media: [],
      } as any,
      { queueCount: 1 },
    );

    expect(readiness.startIssues).toContain(
      "Each active calling day needs at least one valid time window",
    );
    expect(readiness.startIssues).toContain("Calling hours are required");
  });

  test("accepts scripted live campaign and default options path", () => {
    const readiness = getCampaignReadiness(
      {
        type: "live",
        caller_id: "+15555550100",
        start_date: "2026-03-10T10:00:00.000Z",
        end_date: "2026-03-11T10:00:00.000Z",
        schedule: validSchedule,
      } as any,
      {
        script_id: 123,
      } as any,
    );

    expect(readiness.startIssues).toEqual([]);
    expect(readiness.startDisabledReason).toBeNull();
  });

  test("requires message content when message body and media are both missing", () => {
    const readiness = getCampaignReadiness(
      {
        type: "message",
        caller_id: "+15555550100",
        start_date: "2026-03-10T10:00:00.000Z",
        end_date: "2026-03-11T10:00:00.000Z",
        schedule: validSchedule,
      } as any,
      {
        body_text: "   ",
        message_media: [],
      } as any,
      { queueCount: 1 },
    );

    expect(readiness.startIssues).toContain(
      "Message content or media is required",
    );
  });

  test("message campaign in messaging_service mode does not require caller_id", () => {
    const readiness = getCampaignReadiness(
      {
        type: "message",
        caller_id: null,
        sms_send_mode: "messaging_service",
        sms_messaging_service_sid: "MG123",
        start_date: "2026-03-10T10:00:00.000Z",
        end_date: "2026-03-11T10:00:00.000Z",
        schedule: validSchedule,
      } as any,
      {
        body_text: "Hello there",
        message_media: [],
      } as any,
      { queueCount: 1, smsMessagingServiceSendersReady: true },
    );

    expect(readiness.startIssues).not.toContain(
      "An outbound phone number is required",
    );
    expect(readiness.startIssues).toEqual([]);
  });

  test("message campaign in messaging_service mode flags missing SID", () => {
    const readiness = getCampaignReadiness(
      {
        type: "message",
        caller_id: null,
        sms_send_mode: "messaging_service",
        sms_messaging_service_sid: null,
        start_date: "2026-03-10T10:00:00.000Z",
        end_date: "2026-03-11T10:00:00.000Z",
        schedule: validSchedule,
      } as any,
      {
        body_text: "Hello there",
        message_media: [],
      } as any,
      { queueCount: 1, smsMessagingServiceSendersReady: true },
    );

    expect(readiness.startIssues).toContain(
      "Messaging Service SID is required for this send mode (save Messaging Service selection)",
    );
  });

  test("message campaign in messaging_service mode flags unavailable senders", () => {
    const readiness = getCampaignReadiness(
      {
        type: "message",
        caller_id: null,
        sms_send_mode: "messaging_service",
        sms_messaging_service_sid: "MG123",
        start_date: "2026-03-10T10:00:00.000Z",
        end_date: "2026-03-11T10:00:00.000Z",
        schedule: validSchedule,
      } as any,
      {
        body_text: "Hello there",
        message_media: [],
      } as any,
      { queueCount: 1, smsMessagingServiceSendersReady: false },
    );

    expect(readiness.startIssues).toContain(
      "Messaging Service has no available sender numbers; attach senders in onboarding or use a phone number",
    );
  });

  test("handles active schedule days with non-array intervals", () => {
    const readiness = getCampaignReadiness(
      {
        type: "message",
        caller_id: "+15555550100",
        start_date: "2026-03-10T10:00:00.000Z",
        end_date: "2026-03-11T10:00:00.000Z",
        schedule: {
          monday: { active: true, intervals: { start: "09:00", end: "17:00" } },
        },
      } as any,
      {
        body_text: "Hello",
        message_media: [],
      } as any,
      { queueCount: 1 },
    );

    expect(readiness.startIssues).toContain("Calling hours are required");
    expect(readiness.startIssues).toContain(
      "Each active calling day needs at least one valid time window",
    );
  });
});
