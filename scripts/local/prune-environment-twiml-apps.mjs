#!/usr/bin/env node
/* eslint-env node */

/**
 * Delete TwiML Apps belonging to environments that no longer exist.
 *
 * Environment apps are provisioned at boot by app/server/environment-twiml-app.server.ts
 * and named `env:<railway-environment-name>`. Nothing deletes them when a PR
 * closes, so they accumulate against the account's app limit. This reconciles the
 * Twilio side against the environments Railway still reports.
 *
 * Only PR environments are ever deleted. Long-lived environments (dev, staging)
 * are reported and left alone: their apps are not disposable, and a transient
 * Railway API hiccup that returned a short environment list would otherwise be
 * enough to delete them.
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

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import Twilio from "twilio";

const execFileAsync = promisify(execFile);
const ENVIRONMENT_APP_PREFIX = "env:";

/** Railway names PR environments `callcaster-pr-<number>`; only these are disposable. */
const EPHEMERAL_ENVIRONMENT_PATTERN = /^callcaster-pr-\d+$/;

async function main() {
  const apply = process.argv.includes("--apply");

  const client = new Twilio.Twilio(
    requireEnv("TWILIO_SID"),
    requireEnv("TWILIO_AUTH_TOKEN"),
  );

  const liveEnvironments = await loadRailwayEnvironments();
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
 * Bail out rather than guess: an empty or partial list here would classify every
 * live environment as stale and delete apps that are still in use.
 */
async function loadRailwayEnvironments() {
  // `railway environment` refuses to run outside a TTY; `railway status --json`
  // returns the linked project including every environment, and works headless.
  let stdout;
  try {
    ({ stdout } = await execFileAsync("railway", ["status", "--json"], {
      timeout: 30_000,
    }));
  } catch (error) {
    throw new Error(
      `Could not read Railway project status (is the railway CLI installed and ` +
        `linked to the CallCaster project?): ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`Railway CLI returned output this script cannot parse:\n${stdout}`);
  }

  const names = (parsed?.environments?.edges ?? [])
    .map((edge) => edge?.node)
    .filter((node) => node && !node.deletedAt)
    .map((node) => node.name)
    .filter((name) => typeof name === "string" && name.length > 0);

  if (names.length === 0) {
    throw new Error(
      "Railway reported zero environments. Refusing to prune, since that would " +
        "delete every environment app including live ones.",
    );
  }

  return new Set(names);
}

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
