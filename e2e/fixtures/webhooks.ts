import type { APIRequestContext, APIResponse } from "@playwright/test";
import { getExpectedTwilioSignature } from "twilio/lib/webhooks/webhooks.js";
import { E2E_TWILIO_SUBACCOUNT } from "./seed";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";

/**
 * How a fixture signs the request:
 * - `valid`: X-Twilio-Signature computed with the seeded subaccount token (default)
 * - `missing`: no signature header
 * - `wrong-token`: signed with a token the seeded workspace does not have
 * - `tampered`: signed for a different body than the one sent
 */
export type WebhookSigning = "valid" | "missing" | "wrong-token" | "tampered";

/**
 * Signature the app expects for a webhook to `path`. The server validates
 * against `BASE_URL + pathname` (`resolveCanonicalTwilioWebhookUrl`), which the
 * harness sets to the same origin this fixture posts to.
 */
export function twilioWebhookSignature(
  path: string,
  params: Record<string, string>,
  authToken: string = E2E_TWILIO_SUBACCOUNT.authToken,
): string {
  return getExpectedTwilioSignature(authToken, `${baseURL}${path}`, params);
}

function signatureHeader(
  path: string,
  params: Record<string, string>,
  signing: WebhookSigning,
): Record<string, string> {
  switch (signing) {
    case "missing":
      return {};
    case "wrong-token":
      return { "X-Twilio-Signature": twilioWebhookSignature(path, params, "not-the-seeded-token") };
    case "tampered":
      return {
        "X-Twilio-Signature": twilioWebhookSignature(path, { ...params, Tampered: "1" }),
      };
    default:
      return { "X-Twilio-Signature": twilioWebhookSignature(path, params) };
  }
}

async function postTwilioForm(
  request: APIRequestContext,
  path: string,
  params: Record<string, string>,
  signing: WebhookSigning,
): Promise<APIResponse> {
  return request.post(`${baseURL}${path}`, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...signatureHeader(path, params, signing),
    },
    data: new URLSearchParams(params).toString(),
  });
}

export async function postCallStatus(
  request: APIRequestContext,
  params: {
    callSid?: string;
    callStatus?: string;
    duration?: string;
    campaignId?: number;
    signing?: WebhookSigning;
  } = {},
): Promise<APIResponse> {
  // A fresh CallSid has no call row, so the server locates the workspace
  // (and its auth token) through the AccountSid fallback.
  const body: Record<string, string> = {
    AccountSid: E2E_TWILIO_SUBACCOUNT.sid,
    CallSid: params.callSid ?? `CA_e2e_webhook_${Date.now()}`,
    CallStatus: params.callStatus ?? "completed",
    CallDuration: params.duration ?? "30",
    ...(params.campaignId ? { campaignId: String(params.campaignId) } : {}),
  };
  return postTwilioForm(request, "/api/call-status", body, params.signing ?? "valid");
}

export async function postSmsStatus(
  request: APIRequestContext,
  params: {
    messageSid?: string;
    status?: string;
    signing?: WebhookSigning;
  } = {},
): Promise<APIResponse> {
  const body = {
    AccountSid: E2E_TWILIO_SUBACCOUNT.sid,
    MessageSid: params.messageSid ?? "SM_e2e_webhook_test",
    MessageStatus: params.status ?? "delivered",
  };
  return postTwilioForm(request, "/api/sms/status", body, params.signing ?? "valid");
}

export async function postInboundSms(
  request: APIRequestContext,
  params: {
    from: string;
    to: string;
    body: string;
    signing?: WebhookSigning;
  },
): Promise<APIResponse> {
  const form = {
    From: params.from,
    To: params.to,
    Body: params.body,
    MessageSid: `SM_e2e_inbound_${Date.now()}`,
  };
  return postTwilioForm(request, "/api/inbound-sms", form, params.signing ?? "valid");
}

export async function postIvrStatus(
  request: APIRequestContext,
  params: {
    callSid?: string;
    status?: string;
    signing?: WebhookSigning;
  } = {},
): Promise<APIResponse> {
  const body = {
    AccountSid: E2E_TWILIO_SUBACCOUNT.sid,
    CallSid: params.callSid ?? "CA_e2e_ivr_webhook",
    CallStatus: params.status ?? "completed",
  };
  return postTwilioForm(request, "/api/ivr/status", body, params.signing ?? "valid");
}
