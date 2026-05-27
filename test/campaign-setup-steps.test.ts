import { describe, expect, test } from "vitest";

import {
  DEFAULT_WEEKDAY_CALLING_SCHEDULE,
  getCampaignSetupDismissKey,
  getCampaignSetupSteps,
  getDefaultCampaignDates,
  shouldShowCampaignSetupGuide,
} from "../app/lib/campaign-setup-steps";

const validSchedule = DEFAULT_WEEKDAY_CALLING_SCHEDULE;

describe("app/lib/campaign-setup-steps.ts", () => {
  test("shouldShowCampaignSetupGuide respects first draft, dismiss, and completion", () => {
    expect(
      shouldShowCampaignSetupGuide({
        isFirstDraftCampaign: true,
        dismissed: false,
        allComplete: false,
      }),
    ).toBe(true);

    expect(
      shouldShowCampaignSetupGuide({
        isFirstDraftCampaign: false,
        dismissed: false,
        allComplete: false,
      }),
    ).toBe(false);

    expect(
      shouldShowCampaignSetupGuide({
        isFirstDraftCampaign: true,
        dismissed: true,
        allComplete: false,
      }),
    ).toBe(false);

    expect(
      shouldShowCampaignSetupGuide({
        isFirstDraftCampaign: true,
        dismissed: false,
        allComplete: true,
      }),
    ).toBe(false);
  });

  test("getCampaignSetupDismissKey is stable per campaign", () => {
    expect(getCampaignSetupDismissKey(42)).toBe("campaign-setup-dismissed:42");
  });

  test("getDefaultCampaignDates returns a 30-day span", () => {
    const { start_date, end_date } = getDefaultCampaignDates();
    const start = new Date(start_date);
    const end = new Date(end_date);
    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(30);
  });

  test("live_call campaign orders phone, content, schedule, queue steps", () => {
    const result = getCampaignSetupSteps({
      campaignData: {
        type: "live_call",
        caller_id: null,
        start_date: null,
        end_date: null,
        schedule: null,
        status: "draft",
      } as any,
      campaignDetails: { script_id: null } as any,
      phoneNumbers: [],
      queueCount: 0,
      audienceCount: 0,
      scriptsCount: 0,
      workspaceId: "ws-1",
    });

    expect(result.steps.map((step) => step.id)).toEqual([
      "phone_number",
      "content",
      "schedule",
      "queue",
      "launch",
    ]);
    expect(result.currentStepId).toBe("phone_number");
    expect(result.steps[0]?.status).toBe("current");
    expect(result.allComplete).toBe(false);
  });

  test("marks steps complete for a ready live_call campaign", () => {
    const result = getCampaignSetupSteps({
      campaignData: {
        type: "live_call",
        caller_id: "+15555550100",
        start_date: "2026-03-10T10:00:00.000Z",
        end_date: "2026-03-11T10:00:00.000Z",
        schedule: validSchedule,
        status: "draft",
      } as any,
      campaignDetails: { script_id: 7 } as any,
      phoneNumbers: [{ phone_number: "+15555550100" } as any],
      queueCount: 3,
      audienceCount: 1,
      scriptsCount: 2,
      workspaceId: "ws-1",
    });

    expect(result.allComplete).toBe(true);
    expect(result.currentStepId).toBe(null);
    expect(result.steps.every((step) => step.status === "complete")).toBe(true);
  });

  test("message campaigns in messaging_service mode include messaging step instead of phone", () => {
    const result = getCampaignSetupSteps({
      campaignData: {
        type: "message",
        sms_send_mode: "messaging_service",
        sms_messaging_service_sid: null,
        start_date: "2026-03-10T10:00:00.000Z",
        end_date: "2026-03-11T10:00:00.000Z",
        schedule: validSchedule,
        status: "draft",
      } as any,
      campaignDetails: { body_text: "Hello", message_media: [] } as any,
      phoneNumbers: [],
      queueCount: 1,
      audienceCount: 1,
      scriptsCount: 0,
      workspaceId: "ws-1",
      smsMessagingServiceSendersReady: false,
    });

    expect(result.steps.map((step) => step.id)).toEqual([
      "messaging",
      "content",
      "schedule",
      "queue",
      "launch",
    ]);
    expect(result.currentStepId).toBe("messaging");
  });

  test("queue step links to audience creation when workspace has no audiences", () => {
    const result = getCampaignSetupSteps({
      campaignData: {
        type: "live_call",
        caller_id: "+15555550100",
        start_date: "2026-03-10T10:00:00.000Z",
        end_date: "2026-03-11T10:00:00.000Z",
        schedule: validSchedule,
        status: "draft",
      } as any,
      campaignDetails: { script_id: 7 } as any,
      phoneNumbers: [{ phone_number: "+15555550100" } as any],
      queueCount: 0,
      audienceCount: 0,
      scriptsCount: 0,
      workspaceId: "ws-1",
    });

    const queueStep = result.steps.find((step) => step.id === "queue");
    expect(queueStep?.status).toBe("current");
    expect(queueStep?.action).toMatchObject({
      type: "link",
      href: "/workspaces/ws-1/audiences/new",
    });
  });
});
