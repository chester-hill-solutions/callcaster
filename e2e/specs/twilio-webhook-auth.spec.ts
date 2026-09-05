import { test, expect } from "../fixtures/test-base";
import { postCallStatus, postInboundSms } from "../fixtures/webhooks";
import { E2E_CAMPAIGNS, E2E_WORKSPACE_NUMBER } from "../fixtures/seed";

/**
 * The harness runs with signature validation ON, so these requests cross the
 * real Twilio auth boundary: the seeded subaccount token must sign every
 * callback, and anything else is rejected before the route body runs.
 */
test.describe("Twilio webhook signatures", () => {
  test("WHA-01 signed call status callback passes the signature gate", async ({ request }) => {
    const response = await postCallStatus(request, { campaignId: E2E_CAMPAIGNS.liveCall.id });
    expect(response.status()).not.toBe(403);
  });

  test("WHA-02 unsigned call status callback is rejected", async ({ request }) => {
    const response = await postCallStatus(request, { signing: "missing" });
    expect(response.status()).toBe(403);
  });

  test("WHA-03 callback signed with another token is rejected", async ({ request }) => {
    const response = await postCallStatus(request, { signing: "wrong-token" });
    expect(response.status()).toBe(403);
  });

  test("WHA-04 callback whose body differs from the signed body is rejected", async ({ request }) => {
    const response = await postCallStatus(request, { signing: "tampered" });
    expect(response.status()).toBe(403);
  });

  test("WHA-05 unsigned inbound SMS is rejected", async ({ request }) => {
    const response = await postInboundSms(request, {
      from: "+15555501998",
      to: E2E_WORKSPACE_NUMBER.phone,
      body: "unsigned",
      signing: "missing",
    });
    expect(response.status()).toBe(403);
  });
});
