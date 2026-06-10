import { describe, expect, test } from "vitest";

import { parseTwilioPortalConfigForm } from "../../app/lib/schemas/twilio-portal-config";

describe("twilio-portal-config schema", () => {
  test("parses ops-only portal fields from form data", () => {
    const formData = new FormData();
    formData.set("trafficClass", "toll_free");
    formData.set("throughputProduct", "none");
    formData.set("multiTenancyMode", "none");
    formData.set("smsSenderClass", "verified_toll_free");
    formData.set("smsTargetMps", "3");
    formData.set("voiceTargetCps", "2");
    formData.set("voiceConcurrentCallLimit", "50");
    formData.set("parallelDispatchEnabled", "on");
    formData.set("supportNotes", "rollout notes");

    expect(parseTwilioPortalConfigForm(formData)).toMatchObject({
      trafficClass: "toll_free",
      smsSenderClass: "verified_toll_free",
      smsTargetMps: 3,
      voiceTargetCps: 2,
      voiceConcurrentCallLimit: 50,
      parallelDispatchEnabled: true,
      supportNotes: "rollout notes",
    });
  });

  test("ignores provisioning fields not present in ops schema", () => {
    const formData = new FormData();
    formData.set("trafficClass", "unknown");
    formData.set("throughputProduct", "none");
    formData.set("multiTenancyMode", "none");
    formData.set("sendMode", "messaging_service");
    formData.set("messagingServiceSid", "MGSHOULDNOTPARSE");
    formData.set("onboardingStatus", "enabled");
    formData.set("smsSenderClass", "unknown");
    formData.set("smsTargetMps", "1");
    formData.set("voiceTargetCps", "1");
    formData.set("voiceConcurrentCallLimit", "100");
    formData.set("supportNotes", "");

    const parsed = parseTwilioPortalConfigForm(formData);
    expect(parsed).not.toHaveProperty("sendMode");
    expect(parsed).not.toHaveProperty("messagingServiceSid");
    expect(parsed).not.toHaveProperty("onboardingStatus");
  });
});
