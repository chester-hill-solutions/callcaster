/**
 * One-shot ops task (#1982): set the support email shown on Stripe-hosted
 * receipts and invoices. The receipt footer ("If you have any questions,
 * contact us at …") comes from the account's Public business information, not
 * app code — this script makes the setting reproducible.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=... bun run scripts/set-stripe-support-email.ts
 *
 * Idempotent — re-running is safe. If the API rejects the update for a
 * non-Connect account, set it in the Dashboard instead (Settings → Public
 * business information → Support email).
 */
import Stripe from "stripe";
import { STRIPE_CLIENT_OPTIONS } from "@/lib/stripe-client-options";

export {};
if (!process.env.STRIPE_SECRET_KEY) {
  console.error("STRIPE_SECRET_KEY is required.");
  process.exit(1);
}

const SUPPORT_EMAIL = "contact@callcaster.ca";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, STRIPE_CLIENT_OPTIONS);
const account = await stripe.accounts.retrieve();
const updated = await stripe.accounts.update(account.id, {
  business_profile: {
    support_email: SUPPORT_EMAIL,
  },
});

console.log(
  `account ${updated.id} business_profile.support_email -> ${
    updated.business_profile?.support_email ?? "(unset)"
  }`,
);