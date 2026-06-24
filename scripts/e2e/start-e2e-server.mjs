#!/usr/bin/env node
/* eslint-env node */
import "dotenv/config";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

const env = {
  ...process.env,
  HOST: process.env.HOST ?? "0.0.0.0",
  PORT: process.env.PORT ?? "3000",
  BASE_URL: process.env.BASE_URL ?? process.env.E2E_BASE_URL ?? "http://localhost:3000",
  TWILIO_VALIDATE_WEBHOOKS: process.env.TWILIO_VALIDATE_WEBHOOKS ?? "false",
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? "sk_test_e2e_placeholder",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_e2e_placeholder",
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? "re_e2e_placeholder",
  TWILIO_SID: process.env.TWILIO_SID ?? "AC_e2e_test_sid_placeholder",
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN ?? "e2e_twilio_auth_token",
  TWILIO_APP_SID: process.env.TWILIO_APP_SID ?? "AP_e2e_test_app_sid",
  TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER ?? "+15555501001",
};

async function waitForReady(baseURL, attempts = 90) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(`${baseURL}/readyz`);
      if (response.ok) {
        return;
      }
    } catch {
      // not ready
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Server not ready at ${baseURL}/readyz`);
}

const baseURL = env.BASE_URL;
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
