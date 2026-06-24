import type { APIRequestContext, APIResponse } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export async function postCallStatus(
  request: APIRequestContext,
  params: {
    callSid?: string;
    callStatus?: string;
    duration?: string;
    campaignId?: number;
  } = {},
): Promise<APIResponse> {
  const body = new URLSearchParams({
    CallSid: params.callSid ?? "CA_e2e_webhook_test",
    CallStatus: params.callStatus ?? "completed",
    CallDuration: params.duration ?? "30",
    ...(params.campaignId ? { campaignId: String(params.campaignId) } : {}),
  });
  return request.post(`${baseURL}/api/call-status`, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    data: body.toString(),
  });
}

export async function postSmsStatus(
  request: APIRequestContext,
  params: {
    messageSid?: string;
    status?: string;
  } = {},
): Promise<APIResponse> {
  const body = new URLSearchParams({
    MessageSid: params.messageSid ?? "SM_e2e_webhook_test",
    MessageStatus: params.status ?? "delivered",
  });
  return request.post(`${baseURL}/api/sms/status`, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    data: body.toString(),
  });
}

export async function postInboundSms(
  request: APIRequestContext,
  params: {
    from: string;
    to: string;
    body: string;
  },
): Promise<APIResponse> {
  const form = new URLSearchParams({
    From: params.from,
    To: params.to,
    Body: params.body,
    MessageSid: `SM_e2e_inbound_${Date.now()}`,
  });
  return request.post(`${baseURL}/api/inbound-sms`, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    data: form.toString(),
  });
}

export async function postIvrStatus(
  request: APIRequestContext,
  params: {
    callSid?: string;
    status?: string;
  } = {},
): Promise<APIResponse> {
  const body = new URLSearchParams({
    CallSid: params.callSid ?? "CA_e2e_ivr_webhook",
    CallStatus: params.status ?? "completed",
  });
  return request.post(`${baseURL}/api/ivr/status`, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    data: body.toString(),
  });
}
