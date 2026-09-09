import { describe, expect, test } from "vitest";
import { resolveTwilioRestBasicAuth } from "@/lib/twilio-workspace-credentials";

describe("resolveTwilioRestBasicAuth", () => {
  test("prefers the workspace API Key pair (ADR-0011)", () => {
    expect(
      resolveTwilioRestBasicAuth({
        key: " SKabc ",
        token: "secret",
        twilio_data: { sid: "ACsub", authToken: "tok" },
      }),
    ).toEqual({ username: "SKabc", password: "secret", source: "api-key" });
  });

  test("falls back to the subaccount SID and Auth Token when the key pair is incomplete", () => {
    expect(
      resolveTwilioRestBasicAuth({
        key: "SKabc",
        token: "",
        twilio_data: { sid: "ACsub", authToken: "tok" },
      }),
    ).toEqual({ username: "ACsub", password: "tok", source: "auth-token" });
    expect(
      resolveTwilioRestBasicAuth({ twilio_data: { account_sid: "ACsub", auth_token: "tok" } }),
    ).toEqual({ username: "ACsub", password: "tok", source: "auth-token" });
  });

  test("returns null when neither credential set is usable", () => {
    expect(resolveTwilioRestBasicAuth({ key: null, token: null, twilio_data: null })).toBeNull();
    expect(resolveTwilioRestBasicAuth({ twilio_data: { sid: "ACsub" } })).toBeNull();
  });
});
