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

    expect(readiness.startDisabledReason).toBe("Add at least one contact before starting or scheduling");
    expect(readiness.scheduleIssues).toContain(
      "Add at least one contact before starting or scheduling",
    );
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
            intervals: [{ start: "21:00", end: "13:00" }],
          },
        },
      } as any,
      {
        body_text: "Hello there",
        message_media: [],
      } as any,
      { queueCount: 1 },
    );

    expect(readiness.startIssues).toContain("Start date must be before the end date");
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
});
