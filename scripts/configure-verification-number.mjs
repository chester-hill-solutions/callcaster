#!/usr/bin/env node
/**
 * Point a call-in verification number's Voice URL at `/api/inbound-verification`
 * and register it as the active number in the app database (#2519).
 *
 * The number is platform configuration, not an environment variable: the app
 * reads the active row from `verification_number`, so this script writes both
 * the Twilio webhook and the database row.
 *
 * Usage:
 *   VERIFICATION_PHONE_NUMBER=+15551234567 \
 *   BASE_URL=https://example.com \
 *   DATABASE_URL=postgres://... \
 *   [LABEL=Main] [REGION=ca-central] \
 *   node scripts/configure-verification-number.mjs
 *
 * Uses the main Twilio account (TWILIO_SID / TWILIO_AUTH_TOKEN).
 */

import "dotenv/config";
import postgres from "postgres";
import Twilio from "twilio";

const verificationNumber = process.env.VERIFICATION_PHONE_NUMBER;
const baseUrl = process.env.BASE_URL;
const sid = process.env.TWILIO_SID;
const token = process.env.TWILIO_AUTH_TOKEN;
const databaseUrl = process.env.DATABASE_URL;
const label = process.env.LABEL?.trim() || null;
const region = process.env.REGION?.trim() || null;

if (!verificationNumber || !baseUrl || !sid || !token) {
  console.error(
    "Required: VERIFICATION_PHONE_NUMBER, BASE_URL, TWILIO_SID, TWILIO_AUTH_TOKEN"
  );
  process.exit(1);
}

if (!databaseUrl) {
  console.error(
    "Required: DATABASE_URL (the app registers the number in verification_number, not an env var)"
  );
  process.exit(1);
}

const voiceUrl = `${baseUrl.replace(/\/$/, "")}/api/inbound-verification`;

const twilio = Twilio(sid, token);
const sql = postgres(databaseUrl, { max: 1 });

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
  console.log(`Updated ${verificationNumber} voice URL to ${voiceUrl}`);

  // Register and activate in one transaction so the partial unique index on
  // `is_active` never sees two active rows.
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO verification_number (phone_number, provider_sid, label, region)
      VALUES (${verificationNumber}, ${number.sid}, ${label}, ${region})
      ON CONFLICT (phone_number) DO UPDATE SET
        provider_sid = EXCLUDED.provider_sid,
        label = EXCLUDED.label,
        region = EXCLUDED.region,
        updated_at = now()
    `;
    await tx`
      UPDATE verification_number
      SET is_active = false, updated_at = now()
      WHERE is_active AND phone_number <> ${verificationNumber}
    `;
    await tx`
      UPDATE verification_number
      SET is_active = true, updated_at = now()
      WHERE phone_number = ${verificationNumber}
    `;
  });
  console.log(`Registered ${verificationNumber} as the active verification number`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 }).catch(() => {});
  });
