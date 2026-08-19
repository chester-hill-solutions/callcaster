import { bucket, postgres, service, volume } from "railway/iac";
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

// Worker vars mirror staging's; values land at the cutover window (#1303).
const workerVariables = [
  "BASE_URL",
  "BETTER_AUTH_SECRET",
  "DATABASE_URL",
  "NODE_ENV",
  "RAILWAY_DOCKERFILE_PATH",
  "RESEND_API_KEY",
  "S3_ACCESS_KEY_ID",
  "S3_BUCKET",
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_SECRET_ACCESS_KEY",
  "STRIPE_SECRET_KEY",
  "TWILIO_APP_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "TWILIO_SID",
] as const;

export function productionResources() {
  const app = service("callcaster", {
    // The 2026-08-18 branch-repoint apply triggered a live redeploy — treat
    // every config change to this service as deploy-triggering. Build config
    // stays Supabase-era until the cutover window (#1303) flips it with the
    // v2 promotion; do not "modernize" it in passing.
    source: source("production"),
    build: { buildEnvironment: "V2", builder: "NIXPACKS" },
    replicas: { "us-east4-eqdc4a": 1 },
    env: preservedVariables(appVariables),
  });
  // v2 target database: standard template, schema-only since the July 30
  // prep (verified 0 workspaces / 0 users on 2026-08-18); the cutover clone
  // refreshes it. The legacy "Postgres" service is decommissioned post-soak.
  const database = postgres("Postgres-jAO4", { region: "us-east4-eqdc4a" });
  const legacyDatabase = postgres("Postgres", { region: "us-east4-eqdc4a" });
  const databaseVolume = volume("postgres-volume", {
    region: "us-east4-eqdc4a",
    sizeMB: 50000,
  });
  // Created at apply time; builds from `production` FAIL until the v2
  // promotion lands there (no Dockerfile.worker on the old tree) — expected
  // and harmless, the instance just waits for the cutover.
  const worker = service("callcaster-worker", {
    source: source("production"),
    build: {
      buildEnvironment: "V3",
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile.worker",
    },
    replicas: { "us-east4-eqdc4a": 1 },
    env: preservedVariables(workerVariables),
  });
  const uploads = bucket("callcaster-production", { region: "iad" });

  return [database, legacyDatabase, app, worker, databaseVolume, uploads];
}
