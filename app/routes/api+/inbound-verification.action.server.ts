import { logger } from "@/lib/logger.server";
import { normalizePhoneNumber } from "@/lib/utils";
import Twilio from "twilio";
import {
  appendVerifiedAudioNumber,
  findPendingVerificationSession,
  getUserVerifiedAudioNumbers,
  markVerificationSessionVerified,
} from "@/lib/verification-db.server";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {
  const twiml = new Twilio.twiml.VoiceResponse();

  const formData = await request.formData();
  const from = formData.get("From") as string | null;
  if (!from) {
    twiml.say("Invalid request. Missing caller information.");
    twiml.hangup();
    return new Response(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  let normalizedFrom: string;
  try {
    normalizedFrom = normalizePhoneNumber(from);
  } catch {
    twiml.say("We could not verify your phone number. Please try again.");
    twiml.hangup();
    return new Response(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  const now = new Date().toISOString();
  let session;
  try {
    session = await findPendingVerificationSession(normalizedFrom, now);
  } catch (error) {
    logger.debug("Call-in verification: session lookup failed", {
      from: normalizedFrom,
      error: error instanceof Error ? error.message : String(error),
    });
    session = null;
  }

  if (!session) {
    logger.debug("Call-in verification: no matching session", {
      from: normalizedFrom,
    });
    twiml.say(
      "No active verification session found for this number. Please start verification from the app and call again within 10 minutes.",
    );
    twiml.hangup();
    return new Response(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  const verifiedNumbers = await getUserVerifiedAudioNumbers(session.user_id);
  const phoneToAdd = normalizedFrom;
  if (verifiedNumbers.includes(phoneToAdd)) {
    twiml.say("This number is already verified.");
    twiml.hangup();
    await markVerificationSessionVerified(session.id);
    return new Response(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  try {
    await appendVerifiedAudioNumber(session.user_id, phoneToAdd);
  } catch (updateError) {
    logger.error("Call-in verification: failed to update user", updateError);
    twiml.say("An error occurred while verifying your number. Please try again later.");
    twiml.hangup();
    return new Response(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  await markVerificationSessionVerified(session.id);

  twiml.say("Your phone number has been successfully verified. You may now hang up.");
  twiml.hangup();

  return new Response(twiml.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
};
