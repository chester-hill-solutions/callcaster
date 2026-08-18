import { describe, expect, test } from "vitest";

import {
  getCampaignContentReadinessIssues,
  getCampaignReadiness,
  resolveReadinessQueueCount,
} from "../app/lib/campaign-readiness";

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
      {} as any,
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

  test("rejects unavailable or incapable workspace resources", () => {
    const readiness = getCampaignReadiness(
      {
        type: "live_call",
        caller_id: "+15555550100",
        voicemail_file: "missing-voicemail.mp3",
        start_date: "2026-03-10T10:00:00.000Z",
        end_date: "2026-03-11T10:00:00.000Z",
        schedule: validSchedule,
      } as any,
      {
        script_id: 42,
        voicedrop_audio: "missing-drop.mp3",
      } as any,
      {
        queueCount: 1,
        workspacePhoneNumbers: [
          { phone_number: "+15555550100", capabilities: { sms: true, voice: false } },
        ],
        workspaceScriptIds: [7],
        workspaceAudioNames: ["available.mp3"],
      },
    );

    expect(readiness.startIssues).toEqual(
      expect.arrayContaining([
        "The configured outbound phone number does not support voice",
        "The configured script is unavailable in this workspace",
        "A configured campaign audio file is unavailable",
      ]),
    );
  });

  test("rejects a foreign caller ID and accepts owned resources", () => {
    const baseCampaign = {
      type: "live_call",
      caller_id: "+15555550100",
      start_date: "2026-03-10T10:00:00.000Z",
      end_date: "2026-03-11T10:00:00.000Z",
      schedule: validSchedule,
    } as any;
    const details = { script_id: 42, voicedrop_audio: "drop.mp3" } as any;

    const foreign = getCampaignReadiness(baseCampaign, details, {
      queueCount: 1,
      workspacePhoneNumbers: [],
      workspaceScriptIds: [42],
      workspaceAudioNames: ["drop.mp3"],
    });
    expect(foreign.startIssues).toContain(
      "The configured outbound phone number is unavailable in this workspace",
    );

    const owned = getCampaignReadiness(baseCampaign, details, {
      queueCount: 1,
      workspacePhoneNumbers: [
        { phone_number: "+15555550100", capabilities: { voice: true } },
      ],
      workspaceScriptIds: [42],
      workspaceAudioNames: ["drop.mp3"],
    });
    expect(owned.startIssues).toEqual([]);
  });

  test("filters content readiness issues for the detailed settings section", () => {
    const issues = getCampaignContentReadinessIssues([
      { code: "script_required", message: "Script is required" },
      { code: "outbound_number_required", message: "An outbound phone number is required" },
      { code: "message_content_required", message: "Message content or media is required" },
    ]);

    expect(issues).toEqual([
      "Script is required",
      "Message content or media is required",
    ]);
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
    // Message campaigns with no schedule are unrestricted (send anytime).
    expect(readiness.startIssues).not.toContain("Calling hours are required");
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

  test("blocks bulk SMS on CA local sender class at volume", () => {
    const readiness = getCampaignReadiness(
      {
        type: "message",
        caller_id: "+15555550100",
        start_date: "2026-03-10T10:00:00.000Z",
        end_date: "2026-03-11T10:00:00.000Z",
        schedule: {
          monday: { active: true, intervals: [{ start: "09:00", end: "17:00" }] },
        },
      } as any,
      {
        body_text: "Hello",
        message_media: [],
      } as any,
      { queueCount: 500, smsSenderClass: "ca_local" },
    );

    expect(readiness.startIssues).toContain(
      "Bulk SMS at this queue size requires verified toll-free or a Canadian short code sender. Canadian local long codes are not recommended for campaign volume.",
    );
  });
});

describe("app/lib/campaign-readiness.ts resolveReadinessQueueCount", () => {
  // Regression test for #1255: a fully-sent campaign has 0 *remaining* queued
  // rows (everything has been dequeued), but it was clearly never
  // audience-empty. The readiness "queue_empty" check must be driven by the
  // total number of contacts ever assigned to the campaign, not by how many
  // are still waiting to be dequeued -- otherwise every campaign that
  // finishes sending flips back into "needs attention" on the launch screen.
  test("prefers total assigned count over remaining queued count", () => {
    expect(
      resolveReadinessQueueCount({ totalCount: 500, queuedCount: 0 }),
    ).toBe(500);
  });

  test("treats a fully-dequeued completed campaign as audience-ready, not queue_empty", () => {
    const count = resolveReadinessQueueCount({ totalCount: 500, queuedCount: 0 });
    const readiness = getCampaignReadiness(
      {
        type: "message",
        caller_id: "+15555550100",
        start_date: "2026-03-10T10:00:00.000Z",
        end_date: "2026-03-11T10:00:00.000Z",
        schedule: {
          monday: { active: true, intervals: [{ start: "09:00", end: "17:00" }] },
        },
      } as any,
      {
        body_text: "Hello there",
        message_media: [],
      } as any,
      { queueCount: count },
    );

    expect(readiness.startIssues).not.toContain(
      "Add at least one contact before starting or scheduling",
    );
  });

  test("falls back to remaining queued count when total is unavailable", () => {
    expect(
      resolveReadinessQueueCount({ totalCount: null, queuedCount: 3 }),
    ).toBe(3);
    expect(resolveReadinessQueueCount({})).toBe(0);
  });

  test("does not fall back to 0 total (draft campaign with no queue yet) losing the real remaining count", () => {
    // A brand-new campaign has totalCount 0 and queuedCount 0 -- still correctly queue_empty.
    expect(
      resolveReadinessQueueCount({ totalCount: 0, queuedCount: 0 }),
    ).toBe(0);
  });
});
