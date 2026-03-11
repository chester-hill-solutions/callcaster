#!/usr/bin/env node
/**
 * Configures the verification phone number's Voice URL to point at the inbound-verification endpoint.
 * Uses the main Twilio account (TWILIO_SID / TWILIO_AUTH_TOKEN).
 *
 * Usage: VERIFICATION_PHONE_NUMBER=+15551234567 BASE_URL=https://example.com node scripts/configure-verification-number.mjs
 */

import "dotenv/config";
import Twilio from "twilio";

const verificationNumber = process.env.VERIFICATION_PHONE_NUMBER;
const baseUrl = process.env.BASE_URL;
const sid = process.env.TWILIO_SID;
const token = process.env.TWILIO_AUTH_TOKEN;

if (!verificationNumber || !baseUrl || !sid || !token) {
  console.error(
    "Required: VERIFICATION_PHONE_NUMBER, BASE_URL, TWILIO_SID, TWILIO_AUTH_TOKEN"
  );
  process.exit(1);
}

const voiceUrl = `${baseUrl.replace(/\/$/, "")}/api/inbound-verification`;

const twilio = Twilio(sid, token);

async function main() {
  const numbers = await twilio.incomingPhoneNumbers.list({
    phoneNumber: verificationNumber,
  });
  if (numbers.length === 0) {
    console.error(`Number ${verificationNumber} not found in Twilio account`);
    process.exit(1);
  }
  const number = numbers[0];
  await twilio.incomingPhoneNumbers(number.sid).update({
    voiceUrl,
    voiceMethod: "POST",
  });
  console.log(
    `Updated ${verificationNumber} voice URL to ${voiceUrl}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
