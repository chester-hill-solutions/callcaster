import { describe, expect, test } from "vitest";

import {
  classifyPhoneNumberSenderType,
  classifyTwilioPhoneInventory,
  inferSmsSenderClassFromSenderTypes,
} from "../app/lib/twilio-sender-class.server";

describe("twilio-sender-class.server", () => {
  test("classifies toll-free NPAs", () => {
    expect(classifyPhoneNumberSenderType("+18005551234")).toBe("toll_free");
    expect(classifyPhoneNumberSenderType("+14165551234")).toBe("local");
  });

  test("infers SMS sender class from Twilio sender types", () => {
    expect(inferSmsSenderClassFromSenderTypes(["toll_free"])).toBe(
      "verified_toll_free",
    );
    expect(inferSmsSenderClassFromSenderTypes(["local"])).toBe("ca_local");
  });

  test("classifies Twilio phone inventory", () => {
    expect(
      classifyTwilioPhoneInventory([
        {
          phoneNumber: "+18005551234",
          capabilities: { sms: true, voice: true },
        },
      ]),
    ).toEqual({
      senderTypes: ["toll_free"],
      capabilitySummary: ["sms", "voice"],
    });
  });
});
