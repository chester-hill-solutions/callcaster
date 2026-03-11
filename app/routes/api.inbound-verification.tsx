import type { ActionFunctionArgs } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { normalizePhoneNumber } from "@/lib/utils";
import type { Database } from "@/lib/database.types";

export const action = async ({ request }: ActionFunctionArgs) => {
  const twiml = new Twilio.twiml.VoiceResponse();
  const supabase = createClient<Database>(
    env.SUPABASE_URL(),
    env.SUPABASE_SERVICE_KEY()
  );

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
  const { data: session, error: sessionError } = await supabase
    .from("verification_session")
    .select("id, user_id, expected_caller")
    .eq("expected_caller", normalizedFrom)
    .eq("status", "pending")
    .gte("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessionError || !session) {
    logger.debug("Call-in verification: no matching session", {
      from: normalizedFrom,
      error: sessionError?.message,
    });
    twiml.say(
      "No active verification session found for this number. Please start verification from the app and call again within 10 minutes."
    );
    twiml.hangup();
    return new Response(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  const { data: userData } = await supabase
    .from("user")
    .select("verified_audio_numbers")
    .eq("id", session.user_id)
    .single();

  const verifiedNumbers = userData?.verified_audio_numbers ?? [];
  const phoneToAdd = normalizedFrom;
  if (verifiedNumbers.includes(phoneToAdd)) {
    twiml.say("This number is already verified.");
    twiml.hangup();
    await supabase
      .from("verification_session")
      .update({ status: "verified" })
      .eq("id", session.id);
    return new Response(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  const { error: updateError } = await supabase
    .from("user")
    .update({
      verified_audio_numbers: [...verifiedNumbers, phoneToAdd],
    })
    .eq("id", session.user_id);

  if (updateError) {
    logger.error("Call-in verification: failed to update user", updateError);
    twiml.say("An error occurred while verifying your number. Please try again later.");
    twiml.hangup();
    return new Response(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  await supabase
    .from("verification_session")
    .update({ status: "verified" })
    .eq("id", session.id);

  twiml.say("Your phone number has been successfully verified. You may now hang up.");
  twiml.hangup();

  return new Response(twiml.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
};
