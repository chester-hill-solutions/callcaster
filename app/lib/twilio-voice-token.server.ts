import twilio from "twilio";
import { env } from "@/lib/env.server";

export interface GenerateTokenParams {
  twilioAccountSid: string;
  twilioApiKey: string;
  twilioApiSecret: string;
  identity: string;
}

export function generateTwilioVoiceToken({
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
