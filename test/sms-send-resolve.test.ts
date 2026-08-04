import { describe, expect, test } from "vitest";
import {
  messageCampaignRequiresCallerId,
  resolveTwilioSmsMessagingServiceSid,
  validateScheduledSendAt,
  ScheduleValidationError,
  MIN_SCHEDULE_LEAD_MS,
  MAX_SCHEDULE_LEAD_MS,
} from "../app/lib/sms-send-resolve";
import { makePortalConfig } from "./fixtures/workspace-twilio-portal-config";

const basePortal = makePortalConfig();

describe("app/lib/sms-send-resolve.ts", () => {
  test("explicit request SID wins", () => {
    expect(
      resolveTwilioSmsMessagingServiceSid({
        explicitRequestSid: "MGREQ",
        campaignSmsSendMode: "from_number",
        campaignSmsMessagingServiceSid: "MGCAMP",
        portalConfig: { ...basePortal, sendMode: "messaging_service", messagingServiceSid: "MGPORTAL" },
      }),
    ).toBe("MGREQ");
  });

  test("campaign messaging_service uses campaign SID then portal", () => {
    expect(
      resolveTwilioSmsMessagingServiceSid({
        explicitRequestSid: null,
        campaignSmsSendMode: "messaging_service",
        campaignSmsMessagingServiceSid: "MGCAMP",
        portalConfig: { ...basePortal, sendMode: "messaging_service", messagingServiceSid: "MGPORTAL" },
      }),
    ).toBe("MGCAMP");

    expect(
      resolveTwilioSmsMessagingServiceSid({
        explicitRequestSid: null,
        campaignSmsSendMode: "messaging_service",
        campaignSmsMessagingServiceSid: null,
        portalConfig: { ...basePortal, sendMode: "messaging_service", messagingServiceSid: "MGPORTAL" },
      }),
    ).toBe("MGPORTAL");
  });

  test("campaign from_number blocks portal MS unless explicit override", () => {
    expect(
      resolveTwilioSmsMessagingServiceSid({
        explicitRequestSid: null,
        campaignSmsSendMode: "from_number",
        campaignSmsMessagingServiceSid: "MGCAMP",
        portalConfig: { ...basePortal, sendMode: "messaging_service", messagingServiceSid: "MGPORTAL" },
      }),
    ).toBeNull();
  });

  test("legacy null campaign mode follows portal sendMode", () => {
    expect(
      resolveTwilioSmsMessagingServiceSid({
        explicitRequestSid: null,
        campaignSmsSendMode: null,
        campaignSmsMessagingServiceSid: null,
        portalConfig: { ...basePortal, sendMode: "messaging_service", messagingServiceSid: "MGPORTAL" },
      }),
    ).toBe("MGPORTAL");
  });

  test("messageCampaignRequiresCallerId", () => {
    expect(messageCampaignRequiresCallerId(null)).toBe(true);
    expect(messageCampaignRequiresCallerId("from_number")).toBe(true);
    expect(messageCampaignRequiresCallerId("messaging_service")).toBe(false);
  });

  describe("validateScheduledSendAt", () => {
    const now = new Date("2026-07-09T12:00:00.000Z");

    test("accepts a time within the 15min-35day window", () => {
      const sendAt = new Date(now.getTime() + MIN_SCHEDULE_LEAD_MS).toISOString();
      const result = validateScheduledSendAt(sendAt, now);
      expect(result.toISOString()).toBe(sendAt);
    });

    test("accepts a time exactly at the max window boundary", () => {
      const sendAt = new Date(now.getTime() + MAX_SCHEDULE_LEAD_MS).toISOString();
      expect(() => validateScheduledSendAt(sendAt, now)).not.toThrow();
    });

    test("rejects a time less than 15 minutes out", () => {
      const sendAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
      expect(() => validateScheduledSendAt(sendAt, now)).toThrow(
        ScheduleValidationError,
      );
      expect(() => validateScheduledSendAt(sendAt, now)).toThrow(
        /at least 15 minutes/,
      );
    });

    test("rejects a time more than 35 days out", () => {
      const sendAt = new Date(
        now.getTime() + MAX_SCHEDULE_LEAD_MS + 60 * 1000,
      ).toISOString();
      expect(() => validateScheduledSendAt(sendAt, now)).toThrow(
        /within 35 days/,
      );
    });

    test("rejects an unparseable date string", () => {
      expect(() => validateScheduledSendAt("not-a-date", now)).toThrow(
        /valid date\/time/,
      );
    });
  });
});
