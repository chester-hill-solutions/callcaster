import { bucket, postgres, service, volume } from "railway/iac";
import { preservedVariables, source } from "../config/shared.js";

// Staging is a Railway environment mirroring production (#1300): v2 topology,
// same code lineage, test-mode Stripe keys as the only intended difference.
// Values are populated from dev by scripts/railway/sync-staging-vars.sh —
// dev's Stripe keys are already test-mode and Twilio is shared for now.
//
// Applying this DELETES the legacy hearty-expression service (the Supabase-era
// staging app, frozen since 2026-06-24). That is the point of phase 2, but the
// apply is destructive and stays human-reviewed/manual — CI only ever plans
// staging on PRs (applies fire on production pushes, and this graph reaches
// the production branch only at cutover).
//
// Source: `master` during the rehearsal (it carries v2 as of #1120; the
// `production` branch is still pre-v2). Phase 3 flips this to
// source("production") in the same change that promotes v2 to that branch.
const appVariables = [
  "BASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "COHERE_API_KEY",
  "DATABASE_URL",
  "ELEVENLABS_API_KEY",
  "HOST",
  "NODE_ENV",
  "PORT",
  "RESEND_API_KEY",
  "RUN_CLIENT_MIGRATIONS_ON_BOOT",
  "S3_ACCESS_KEY_ID",
  "S3_BUCKET",
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_SECRET_ACCESS_KEY",
  "SIGNUP_OPEN",
  "STRIPE_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "TWILIO_API_KEY",
  "TWILIO_API_SECRET",
  "TWILIO_APP_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "TWILIO_SID",
] as const;
// DISABLE_2FA_ENFORCEMENT is deliberately absent: dev-only. Staging matches
// production behavior.

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

export function stagingResources() {
  const appSource = source("master");
  // Standard Railway Postgres template. The 2026-08-18 apply silently failed
  // to create dev's custom-image database ("PostgreSQL 18" / xlab image —
  // plans fine, never materializes), so staging got `railway add --database
  // postgres` instead; this models what actually exists. Note for phase 3:
  // do NOT model a custom-image database for a fresh environment.
  const database = postgres("Postgres-mgzk", { region: "us-east4-eqdc4a" });
  const databaseVolume = volume("postgres-volume-uPSP", {
    region: "us-east4-eqdc4a",
    sizeMB: 50000,
  });
  const app = service("CallCaster", {
    source: appSource,
    healthcheck: "/readyz",
    healthcheckTimeout: 30,
    replicas: { "us-east4-eqdc4a": 1 },
    networking: { privateNetworkEndpoint: "callcaster" },
    env: preservedVariables(appVariables),
  });
  const worker = service("callcaster-worker", {
    source: appSource,
    build: {
      buildEnvironment: "V3",
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile.worker",
    },
    replicas: { "us-east4-eqdc4a": 1 },
    env: preservedVariables(workerVariables),
  });

  const uploads = bucket("callcaster-staging", { region: "iad" });

  return [database, app, worker, databaseVolume, uploads];
}
