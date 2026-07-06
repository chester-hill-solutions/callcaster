#!/usr/bin/env node
/* eslint-env node */
import "dotenv/config";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

const port = process.env.PORT ?? process.env.E2E_PORT ?? "3100";
const baseURL =
  process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;

const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? "production",
  HOST: process.env.HOST ?? "0.0.0.0",
  PORT: port,
  BASE_URL: baseURL,
  TWILIO_VALIDATE_WEBHOOKS: process.env.TWILIO_VALIDATE_WEBHOOKS ?? "false",
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? "sk_test_e2e_placeholder",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_e2e_placeholder",
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? "re_e2e_placeholder",
  TWILIO_SID: process.env.TWILIO_SID ?? "AC_e2e_test_sid_placeholder",
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN ?? "e2e_twilio_auth_token",
  TWILIO_APP_SID: process.env.TWILIO_APP_SID ?? "AP_e2e_test_app_sid",
  TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER ?? "+15555501001",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "e2e-better-auth-secret-min-32-chars!!",
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? baseURL,
  E2E_DISABLE_2FA_ENFORCEMENT: process.env.E2E_DISABLE_2FA_ENFORCEMENT ?? "1",
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? "http://127.0.0.1:9000",
  S3_REGION: process.env.S3_REGION ?? "us-east-1",
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID ?? "callcaster",
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY ?? "callcaster-dev-secret",
  S3_BUCKET: process.env.S3_BUCKET ?? "callcaster",
};

async function waitForReady(readyUrl, attempts = 90) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(`${readyUrl}/readyz`);
      if (response.ok) {
        return;
      }
    } catch {
      // not ready
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Server not ready at ${readyUrl}/readyz`);
}

const child = spawn("node", ["./server/index.js"], {
  cwd: rootDir,
  env,
  stdio: "inherit",
});

async function shutdown(code = 0) {
  child.kill("SIGTERM");
  process.exit(code);
}

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(0));

try {
  await waitForReady(baseURL);
  console.log(`[e2e-server] ready at ${baseURL}`);
} catch (error) {
  console.error(error);
  await shutdown(1);
}

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
