import { env } from "@/lib/env.server";
import twilio from "twilio";

interface GenerateTokenParams {
  twilioAccountSid: string;
  twilioApiKey: string;
  twilioApiSecret: string;
  identity: string;
}

export async function generateToken({
  twilioAccountSid,
  twilioApiKey,
  twilioApiSecret,
  identity,
}: GenerateTokenParams) {
  const voiceGrant = new twilio.jwt.AccessToken.VoiceGrant({
    outgoingApplicationSid: env.TWILIO_APP_SID(),
    incomingAllow: true,
  });
  const token = new twilio.jwt.AccessToken(
    twilioAccountSid,
    twilioApiKey,
    twilioApiSecret,
    { identity },
  );
  token.addGrant(voiceGrant);
  return token.toJwt();
}
