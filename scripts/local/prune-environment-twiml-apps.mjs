#!/usr/bin/env node
/* eslint-env node */

/**
 * Delete TwiML Apps belonging to environments that no longer exist.
 *
 * Environment apps are provisioned at boot by app/server/environment-twiml-app.server.ts
 * and named `env:<railway-environment-name>`. Nothing deletes them when a PR
 * closes, so they accumulate against the account's app limit.
 *
 * A preview environment is alive while its pull request is open. The Railway
 * CLI does NOT report pull-request preview environments, so the live set comes
 * from scripts/lib/live-environments.mjs: the Railway environments plus one
 * entry per open pull request. Reading the Railway list alone would call every
 * preview dead, including the preview of a pull request that is open now, and
 * would delete its app.
 *
 * Only PR environments are ever deleted. Long-lived environments (dev, qa,
 * production) are reported and left alone: their apps are not disposable, and
 * a transient API hiccup that returned a short list would otherwise be enough
 * to delete them.
 *
 * Dry-run by default; pass --apply to delete.
 *
 * Run with bun, not node: the twilio package pulls in buffer-equal-constant-time,
 * which reads SlowBuffer and throws on import under Node 24+.
 *
 *   bun ./scripts/local/prune-environment-twiml-apps.mjs
 *   bun ./scripts/local/prune-environment-twiml-apps.mjs --apply
 */

import "dotenv/config";

import Twilio from "twilio";

import { loadLiveEnvironmentNames } from "../lib/live-environments.mjs";

const ENVIRONMENT_APP_PREFIX = "env:";

/** Railway names PR environments `callcaster-pr-<number>`; only these are disposable. */
const EPHEMERAL_ENVIRONMENT_PATTERN = /^callcaster-pr-\d+$/;

async function main() {
  const apply = process.argv.includes("--apply");

  const client = new Twilio.Twilio(
    requireEnv("TWILIO_SID"),
    requireEnv("TWILIO_AUTH_TOKEN"),
  );

  const liveEnvironments = await loadLiveEnvironmentNames();
  const applications = await client.applications.list({ limit: 1000 });
  const environmentApps = applications.filter((application) =>
    (application.friendlyName ?? "").startsWith(ENVIRONMENT_APP_PREFIX),
  );

  const named = environmentApps.map((application) => ({
    application,
    environmentName: application.friendlyName.slice(ENVIRONMENT_APP_PREFIX.length),
  }));

  const protectedApps = named.filter(
    ({ environmentName }) => !EPHEMERAL_ENVIRONMENT_PATTERN.test(environmentName),
  );
  const stale = named.filter(
    ({ environmentName }) =>
      EPHEMERAL_ENVIRONMENT_PATTERN.test(environmentName) &&
      !liveEnvironments.has(environmentName),
  );

  console.log(`Railway environments:   ${liveEnvironments.size}`);
  console.log(`Environment TwiML Apps: ${environmentApps.length}`);
  console.log(`Protected (non-PR):     ${protectedApps.length}`);
  console.log(`Stale (prunable):       ${stale.length}`);

  if (protectedApps.length > 0) {
    console.log("");
    console.log("Protected — never auto-deleted:");
    for (const { application } of protectedApps) {
      console.log(`  ${application.sid}  ${application.friendlyName}`);
    }
  }

  if (stale.length === 0) {
    return;
  }

  console.log("");
  console.log("Stale PR environments:");
  for (const { application } of stale) {
    console.log(`  ${application.sid}  ${application.friendlyName}`);
  }

  if (!apply) {
    console.log("");
    console.log("Dry run. Re-run with --apply to delete these.");
    return;
  }

  console.log("");
  for (const { application } of stale) {
    await client.applications(application.sid).remove();
    console.log(`  deleted ${application.sid}  ${application.friendlyName}`);
  }
}

/**
 * The Railway CLI is the source of truth for which environments still exist.
 * See scripts/lib/railway-environments.mjs.
 */
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

main().catch((error) => {
  console.error("");
  console.error("Environment TwiML App prune failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
