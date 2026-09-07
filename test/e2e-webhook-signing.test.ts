import { describe, expect, test } from "vitest";
import { validateRequest } from "twilio/lib/webhooks/webhooks.js";

import { E2E_TWILIO_SUBACCOUNT } from "../e2e/fixtures/seed";
import { twilioWebhookSignature } from "../e2e/fixtures/webhooks";

const E2E_ORIGIN = "http://127.0.0.1:3100";
const PATH = "/api/call-status";
const PARAMS = { AccountSid: E2E_TWILIO_SUBACCOUNT.sid, CallSid: "CA_sign", CallStatus: "completed" };

describe("E2E webhook fixture signing", () => {
  test("signs with the seeded subaccount token against BASE_URL + pathname", () => {
    const signature = twilioWebhookSignature(PATH, PARAMS);
    expect(
      validateRequest(E2E_TWILIO_SUBACCOUNT.authToken, signature, `${E2E_ORIGIN}${PATH}`, PARAMS),
    ).toBe(true);
  });

  test("does not validate against a different token", () => {
    const signature = twilioWebhookSignature(PATH, PARAMS);
    expect(validateRequest("other-token", signature, `${E2E_ORIGIN}${PATH}`, PARAMS)).toBe(false);
  });

  test("does not validate a body that differs from the signed one", () => {
    const signature = twilioWebhookSignature(PATH, PARAMS);
    expect(
      validateRequest(E2E_TWILIO_SUBACCOUNT.authToken, signature, `${E2E_ORIGIN}${PATH}`, {
        ...PARAMS,
        CallStatus: "failed",
      }),
    ).toBe(false);
  });
});
