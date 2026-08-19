import { bucket, postgres, service, volume } from "railway/iac";
import { preservedVariables, source } from "../config/shared.js";

const appVariables = [
  "BASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "COHERE_API_KEY",
  "DATABASE_URL",
  "DISABLE_2FA_ENFORCEMENT",
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

export function devResources() {
  const appSource = source("dev");
  // The live dev database uses this custom image; the SDK type omits the option.
  // @ts-expect-error Railway's runtime supports an image override for database helpers.
  const database = postgres("PostgreSQL 18", {
    image: "xlab/postgres-ssl-18:latest",
    region: "us-east4-eqdc4a",
  });
  const databaseVolume = volume("postgresql-18-volume", {
    alerts: { usage: { "100": {}, "80": {}, "95": {} } },
    allowOnlineResize: true,
    region: "us-east4-eqdc4a",
    sizeMB: 50000,
  });
  // Renamed from "callcaster" 2026-08-18: the display name collided with the
  // production app service (also "callcaster"), which made ${{callcaster.*}}
  // bucket references resolve against the SERVICE (to empty) in dev. Per-env
  // bucket names are now callcaster-dev / -staging / -production.
  const uploads = bucket("callcaster-dev", { region: "iad" });
  const app = service("CallCaster", {
    source: appSource,
    healthcheck: "/readyz",
    healthcheckTimeout: 30,
    replicas: { "us-east4-eqdc4a": 1 },
    networking: { privateNetworkEndpoint: "callcaster-review" },
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

  return [database, app, worker, databaseVolume, uploads];
}
