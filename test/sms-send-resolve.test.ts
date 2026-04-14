import { describe, expect, test } from "vitest";
import {
  messageCampaignRequiresCallerId,
  resolveTwilioSmsMessagingServiceSid,
} from "../app/lib/sms-send-resolve";
import type { WorkspaceTwilioOpsConfig } from "../app/lib/types";

const basePortal: WorkspaceTwilioOpsConfig = {
  trafficClass: "unknown",
  throughputProduct: "none",
  multiTenancyMode: "none",
  trafficShapingEnabled: false,
  defaultMessageIntent: null,
  sendMode: "from_number",
  messagingServiceSid: null,
  onboardingStatus: "not_started",
  supportNotes: "",
  updatedAt: null,
  updatedBy: null,
  auditTrail: [],
};

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
});
