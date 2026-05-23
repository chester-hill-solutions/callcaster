import type { ActionFunctionArgs } from "react-router";
import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";

import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env.server";
import { validateTwilioWebhookForPhoneNumber } from "@/lib/twilio-webhook.server";

/**
 * Twilio calls this when the handset <Dial> ends (timeout, hang up, etc.).
 * Only play "No one is available" when DialCallStatus is no-answer;
 * otherwise just hang up so the caller is not sent to a voicemail-style message.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response(null, { status: 405 });
  }

  const supabase = createClient<Database>(
    env.SUPABASE_URL(),
    env.SUPABASE_SERVICE_KEY(),
  );

  const formData = await request.formData();
  const params = Object.fromEntries(formData.entries()) as Record<string, string>;
  const called = (params.Called ?? params.To ?? "").trim();
  const dialCallStatus = String(params.DialCallStatus ?? "").toLowerCase();

  const validation = await validateTwilioWebhookForPhoneNumber({
    request,
    supabase,
    phoneNumber: called,
    params,
  });
  if (!validation.ok) {
    return validation.response;
  }

  const twiml = new Twilio.twiml.VoiceResponse();

  if (dialCallStatus === "no-answer") {
    twiml.say(
      { voice: "alice" },
      "No one is available to take your call. Please try again later.",
    );
  }

  twiml.hangup();

  return new Response(twiml.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
};
