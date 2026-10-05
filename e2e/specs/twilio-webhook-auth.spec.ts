import { test, expect } from "../fixtures/test-base";
import { postCallStatus, postInboundSms, twilioWebhookSignature } from "../fixtures/webhooks";
import { E2E_CAMPAIGNS, E2E_TWILIO_SUBACCOUNT, E2E_WORKSPACE_NUMBER } from "../fixtures/seed";

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

  test("WHA-06 a signed encoded query passes the real ingress and route gates", async ({ request }) => {
    const path = "/api/call-status?marker=one%20%26%20two&tag=a&tag=b&empty=";
    const params = {
      AccountSid: E2E_TWILIO_SUBACCOUNT.sid,
      CallSid: `CA_e2e_query_${Date.now()}`,
      CallStatus: "ringing",
    };
    const response = await request.post(path, {
      headers: { "X-Twilio-Signature": twilioWebhookSignature(path, params) },
      form: params,
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });

  test("WHA-07 a changed query is rejected with the original signature", async ({ request }) => {
    const params = {
      AccountSid: E2E_TWILIO_SUBACCOUNT.sid,
      CallSid: `CA_e2e_query_changed_${Date.now()}`,
      CallStatus: "ringing",
    };
    const response = await request.post("/api/call-status?marker=changed", {
      headers: { "X-Twilio-Signature": twilioWebhookSignature("/api/call-status?marker=original", params) },
      form: params,
    });
    expect(response.status()).toBe(403);
  });

  test("WHA-08 a query-free signature cannot be reused with an added query", async ({ request }) => {
    const params = {
      AccountSid: E2E_TWILIO_SUBACCOUNT.sid,
      CallSid: `CA_e2e_query_added_${Date.now()}`,
      CallStatus: "ringing",
    };
    const response = await request.post("/api/call-status?marker=added", {
      headers: { "X-Twilio-Signature": twilioWebhookSignature("/api/call-status", params) },
      form: params,
    });
    expect(response.status()).toBe(403);
  });
});
