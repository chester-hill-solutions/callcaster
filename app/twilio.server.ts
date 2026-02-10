import Twilio from "twilio";
import { json } from "@remix-run/node";
import { env } from "@/lib/env.server";

/**
 * Validates that a request came from Twilio using the X-Twilio-Signature header.
 * Use at the top of Twilio webhook actions. Rejects with 403 if invalid.
 * Returns the parsed form params on success so the route can use them.
 *
 * @param request - The incoming request (form-urlencoded body)
 * @param authToken - Twilio auth token (main account or workspace subaccount)
 * @returns On success: { params }. On failure: Response to return (403)
 */
export async function validateTwilioWebhook(
  request: Request,
  authToken: string
): Promise<{ params: Record<string, string> } | Response> {
  const signature = request.headers.get("x-twilio-signature");
  if (!signature) {
    return json({ error: "Missing Twilio signature" }, { status: 403 });
  }

  const url = new URL(request.url).href;
  const formData = await request.formData();
  const params = Object.fromEntries(formData.entries()) as Record<string, string>;

  const isValid = Twilio.validateRequest(authToken, signature, url, params);
  if (!isValid) {
    return json({ error: "Invalid Twilio signature" }, { status: 403 });
  }
  return { params };
}

/**
 * Validates Twilio webhook when formData has already been consumed.
 * Use when the route must look up workspace auth token from params (e.g. CallSid) first.
 */
export function validateTwilioWebhookParams(
  params: Record<string, string>,
  signature: string | null,
  url: string,
  authToken: string
): boolean {
  if (!signature) return false;
  return Twilio.validateRequest(authToken, signature, url, params);
}

declare global {
  // eslint-disable-next-line no-var
  var __singletons: Record<string, unknown> | undefined;
}

export function singleton<Value>(name: string, factory: () => Value): Value {
  if (!global.__singletons) global.__singletons = {};
  if (!(name in global.__singletons)) {
    global.__singletons[name] = factory();
  }
  return global.__singletons[name] as Value;
}

export const twilio = singleton<Twilio.Twilio>("twilio", () =>
  new Twilio.Twilio(env.TWILIO_SID(), env.TWILIO_AUTH_TOKEN())
);

export async function sendSms(request: {
  from: string;
  to: string;
  body: string;
}) {
  return twilio.messages.create(request);
}