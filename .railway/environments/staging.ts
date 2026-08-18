import { service } from "railway/iac";
import { preservedVariables, source } from "../config/shared.js";

const appVariables = [
  "BASE_URL",
  "OPENAI_API_KEY",
  "RESEND_API_KEY",
  "SENDGRID_API_KEY",
  "STRIPE_API_KEY",
  "STRIPE_SECRET_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_KEY",
  "SUPABASE_SKEY",
  "SUPABASE_URL",
  "TWILIO_API_KEY",
  "TWILIO_API_SECRET",
  "TWILIO_APP_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "TWILIO_SID",
] as const;

export function stagingResources() {
  // Models staging exactly as it runs today: the Supabase-era app deployed
  // from `master`, no database services. Phase 2 of #1300 replaces this with
  // the v2 topology (app + worker + PostgreSQL) via a reviewed, destructive
  // apply — do not "align" it here as a side effect of an unrelated change.
  const app = service("hearty-expression", {
    source: source("master"),
    build: { builder: "NIXPACKS" },
    replicas: { "us-west2": 1 },
    env: preservedVariables(appVariables),
  });

  return [app];
}
