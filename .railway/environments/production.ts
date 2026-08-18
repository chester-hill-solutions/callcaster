import { postgres, service, volume } from "railway/iac";
import { preservedVariables, source } from "../config/shared.js";

const appVariables = [
  "BASE_URL",
  "DATABASE_DIRECT_URL",
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "RESEND_API_KEY",
  "STRIPE_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
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

export function productionResources() {
  const app = service("callcaster", {
    // Deploy branch renamed prod → production 2026-08-18 (#1300); the Railway
    // service still points at the deleted `prod` until this is applied.
    source: source("production"),
    build: { buildEnvironment: "V2", builder: "NIXPACKS" },
    replicas: { "us-east4-eqdc4a": 1 },
    env: preservedVariables(appVariables),
  });
  const database = postgres("Postgres-jAO4", { region: "us-east4-eqdc4a" });
  const legacyDatabase = postgres("Postgres", { region: "us-east4-eqdc4a" });
  const databaseVolume = volume("postgres-volume", {
    region: "us-east4-eqdc4a",
    sizeMB: 50000,
  });

  return [database, legacyDatabase, app, databaseVolume];
}
