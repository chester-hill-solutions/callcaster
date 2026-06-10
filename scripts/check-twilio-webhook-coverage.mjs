#!/usr/bin/env node
/**
 * Static audit: Twilio-facing Remix routes must import a signature validator.
 * Exit 1 when a route is missing validation (Phase 3 webhook hardening inventory).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const API_DIR = join(ROOT, "app/routes/api+");

const VALIDATION_PATTERNS = [
  /validateTwilioWebhook/,
  /validateWorkspaceTwilioWebhook/,
  /requireWorkspaceAccess/,
  /verifyAuth/,
  /verifyApiKey/,
  /safeOutboundUrl/,
];

/** Routes that are app-authenticated or non-Twilio; excluded from Twilio signature audit. */
const EXCLUDED_SUFFIXES = [
  "initiate-ivr.action.server.ts",
  "test-webhook.action.server.ts",
  "stripe-webhook.action.server.ts",
  "connect-phone-device.action.server.ts",
  "hangup.action.server.ts",
  "error-report.action.server.ts",
  "verify-audio-session.action.server.ts",
  "verify-pin-input.action.server.ts",
  "inbound-verification.action.server.ts",
];

/** Twilio webhook handlers (POST from Twilio). Loader-only conference connect validated separately. */
const TWILIO_WEBHOOK_SUFFIXES = [
  "inbound.action.server.ts",
  "inbound-sms.action.server.ts",
  "inbound-handset.action.server.ts",
  "inbound-handset-dial-end.action.server.ts",
  "sms/status.action.server.ts",
  "call-status.action.server.ts",
  "dial/status.action.server.ts",
  "auto-dial/status.action.server.ts",
  "auto-dial/$roomId.action.server.ts",
  "recording.action.server.ts",
  "email-vm.action.server.ts",
  "caller-id/status.action.server.ts",
  "ivr/status.action.server.ts",
  "ivr/$campaignId/$pageId.action.server.ts",
  "ivr/$campaignId/$pageId/$blockId.action.server.ts",
  "ivr/$campaignId/$pageId/$blockId/response.action.server.ts",
];

function collectActionFiles(dir, prefix = "") {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const rel = prefix ? `${prefix}/${entry}` : entry;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectActionFiles(full, rel));
    } else if (entry.endsWith(".action.server.ts")) {
      files.push(rel);
    }
  }
  return files;
}

function isTwilioWebhook(relPath) {
  if (EXCLUDED_SUFFIXES.some((suffix) => relPath.endsWith(suffix))) {
    return false;
  }
  return TWILIO_WEBHOOK_SUFFIXES.some((suffix) => relPath.endsWith(suffix));
}

function hasValidation(source) {
  return VALIDATION_PATTERNS.some((pattern) => pattern.test(source));
}

const actionFiles = collectActionFiles(API_DIR);
const twilioRoutes = actionFiles.filter(isTwilioWebhook);
const missing = [];

for (const rel of twilioRoutes) {
  const source = readFileSync(join(API_DIR, rel), "utf8");
  if (!hasValidation(source)) {
    missing.push(rel);
  }
}

const loaderPath = join(
  API_DIR,
  "connect-campaign-conference/$workspaceId/$campaignId.loader.server.ts",
);
let loaderOk = false;
try {
  const loaderSource = readFileSync(loaderPath, "utf8");
  loaderOk = hasValidation(loaderSource);
} catch {
  loaderOk = false;
}

console.log(`Twilio webhook routes scanned: ${twilioRoutes.length}`);
console.log(`connect-campaign-conference loader validated: ${loaderOk ? "yes" : "NO"}`);

if (missing.length > 0) {
  console.error("\nMissing Twilio signature validation:");
  for (const route of missing) {
    console.error(`  - ${route}`);
  }
}

if (!loaderOk) {
  console.error("  - connect-campaign-conference/$workspaceId/$campaignId.loader.server.ts");
}

if (missing.length > 0 || !loaderOk) {
  process.exit(1);
}

console.log("All inventoried Twilio webhook routes include signature or auth validation.");
