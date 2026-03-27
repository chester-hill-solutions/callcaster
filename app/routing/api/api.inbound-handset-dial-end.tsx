import type { ActionFunctionArgs } from "@remix-run/node";
import Twilio from "twilio";

/**
 * Twilio calls this when the handset <Dial> ends (timeout, hang up, etc.).
 * Only play "No one is available" when DialCallStatus is no-answer;
 * otherwise just hang up so the caller is not sent to a voicemail-style message.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response(null, { status: 405 });
  }
  const formData = await request.formData();
  const dialCallStatus = String(formData.get("DialCallStatus") ?? "").toLowerCase();

  const twiml = new Twilio.twiml.VoiceResponse();

  if (dialCallStatus === "no-answer") {
    twiml.say(
      { voice: "alice" },
      "No one is available to take your call. Please try again later."
    );
  }

  twiml.hangup();

  return new Response(twiml.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
};
