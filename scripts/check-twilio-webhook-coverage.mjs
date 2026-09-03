#!/usr/bin/env node
/**
 * Static audit: Twilio-facing action routes must import a signature validator.
 *
 * The expected webhook list is DERIVED from the API surface registry (files
 * matching app/lib/api-surface-*.ts): every entry with authClass "twilioSignature"
 * and a POST operation maps to an action file. A small secondary check catches
 * routes that validate Twilio signatures but aren't classified "twilioSignature"
 * in the registry (they are reported but still validated).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const API_DIR = join(ROOT, "app/routes/api+");
const SURFACE_DIR = join(ROOT, "app/lib");
const SURFACE_PATTERN = /^api-surface-.+\.ts$/;

/** Constructs that actually authenticate a TWILIO request. */
const VALIDATION_PATTERNS = [
  /requireTwilioSignature/,
  /requireTwilioEventsSinkSecret/,
  /validateTwilioWebhook/,
  /validateWorkspaceTwilioWebhook/,
];

/** Routes that are app-authenticated or non-Twilio; excluded from Twilio signature audit. */
const EXCLUDED_SUFFIXES = [
  "initiate-ivr.action.server.ts",
  "test-webhook.action.server.ts",
  "stripe-webhook.action.server.ts",
  "connect-phone-device.action.server.ts",
  "hangup.action.server.ts",
  "error-report.action.server.ts",
];

/**
 * Parse all API surface TS files and extract action file paths for entries
 * with authClass "twilioSignature" and a POST operation.
 */
function deriveExpectedTwilioActionFiles() {
  const entries = readdirSync(SURFACE_DIR).filter((f) => SURFACE_PATTERN.test(f));
  const actionFiles = new Set();

  for (const file of entries) {
    const source = readFileSync(join(SURFACE_DIR, file), "utf8");
    // Each registry entry is an object literal that ends with its nested
    // `operations: [ ... ]` array, e.g.
    //   { path: "...", routeModule: "...", authClass: "twilioSignature",
    //     authVia: "...", operations: [{ method: "POST", handler: "action" }] }
    // (before commit c4d0d040 these were `xSeed({ ... })` calls; the registry
    // is now generated as plain object literals — see api-surface-generated.ts).
    const entryBlocks =
      source.match(/\{\s*path:[\s\S]*?operations:\s*\[[\s\S]*?\]\s*\}/g) ?? [];

    for (const block of entryBlocks) {
      if (!/authClass:\s*"twilioSignature"/.test(block)) continue;
      if (!/method:\s*"POST"/.test(block)) continue;

      const rmMatch = block.match(/routeModule:\s*"([^"]+)"/);
      if (!rmMatch) continue;

      const routeModule = rmMatch[1];
      const rel = routeModule.replace(/^app\/routes\/api\+/, "").replace(/^\//, "");
      const actionRel = rel
        .replace(/\.route\.tsx$/, ".action.server.ts")
        .replace(/\.tsx$/, ".action.server.ts");
      actionFiles.add(actionRel);
    }
  }

  return [...actionFiles].sort();
}

/**
 * Scan action files under API_DIR for import/usage of VALIDATION_PATTERNS.
 * Returns files that validate Twilio signatures but aren't in the expected-twilio set.
 */
function findUnregisteredValidators(registeredTwilioRoutes) {
  const allActionFiles = collectActionFiles(API_DIR);
  const registered = new Set(registeredTwilioRoutes);

  return allActionFiles.filter((rel) => {
    if (EXCLUDED_SUFFIXES.some((s) => rel.endsWith(s))) return false;
    if (registered.has(rel)) return false;
    const source = readFileSync(join(API_DIR, rel), "utf8");
    return VALIDATION_PATTERNS.some((p) => p.test(source));
  });
}

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

function hasValidation(source) {
  return VALIDATION_PATTERNS.some((pattern) => pattern.test(source));
}

const expectedTwilioRoutes = deriveExpectedTwilioActionFiles();

// Self-test: the derivation regressed silently once already (commit c4d0d040
// changed the registry format from xSeed({...}) calls to object literals and
// this gate matched zero routes for weeks while exiting 0). If we derive no
// twilioSignature routes, the derivation is broken again — fail loudly rather
// than green-light an unvalidated Twilio surface.
if (expectedTwilioRoutes.length === 0) {
  console.error(
    "check-twilio-webhooks: derived 0 twilioSignature routes from the API surface " +
      "registry (app/lib/api-surface-*.ts). The registry format likely changed — " +
      "fix deriveExpectedTwilioActionFiles before trusting this gate.",
  );
  process.exit(1);
}

const actionFiles = collectActionFiles(API_DIR);

// Filter the derived list to only files that actually exist on disk
const twilioRoutes = expectedTwilioRoutes.filter((rel) => actionFiles.includes(rel));

const missing = [];

for (const rel of twilioRoutes) {
  const source = readFileSync(join(API_DIR, rel), "utf8");
  if (!hasValidation(source)) {
    missing.push(rel);
  }
}

// Check the connect-campaign-conference loader (GET-only, registered as twilioSignature
// in the API surface but has no POST — checked separately by its loader file).
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

// Report any routes that validate Twilio but aren't registered as twilioSignature
const unregistered = findUnregisteredValidators(twilioRoutes);

console.log(`Twilio webhook routes scanned: ${twilioRoutes.length}`);
console.log(`Derived from api-surface registry: ${expectedTwilioRoutes.length} entries`);
console.log(`connect-campaign-conference loader validated: ${loaderOk ? "yes" : "NO"}`);

if (unregistered.length > 0) {
  console.log(
    `\nWARNING: ${unregistered.length} route(s) validate Twilio signatures but are not registered as authClass "twilioSignature":`,
  );
  for (const route of unregistered) {
    console.log(`  - ${route} (still validated)`);
  }
  // Also check these for validation even though they're unregistered
  for (const rel of unregistered) {
    const source = readFileSync(join(API_DIR, rel), "utf8");
    if (!hasValidation(source)) {
      missing.push(rel);
    }
  }
}

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
