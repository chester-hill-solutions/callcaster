#!/usr/bin/env node
/* eslint-env node */

/**
 * Read-only report: which Twilio resources belong to something that no longer
 * exists, and which ones cannot be judged from here.
 *
 * Usage:
 *   TWILIO_SID=... TWILIO_AUTH_TOKEN=... DATABASE_URL=... \
 *     bun ./scripts/twilio-resource-prune-report.mjs [--json] [--skip-subaccounts]
 *
 *   --json              print the report as JSON instead of a table
 *   --skip-subaccounts  scan only the parent account, not every subaccount
 *
 * This is the dry-run report for #1165. It reads and prints. There is no
 * delete path in this file and there should not be one: the checks that a
 * delete would need live in scripts/lib/twilio-resource-prune-policy.mjs, and
 * the decision to delete is a reviewed step, not a side effect of a report.
 *
 * ## The two checks
 *
 * The environment check and the owner check are applied to every resource, and
 * both are described in scripts/lib/twilio-resource-prune-policy.mjs. In short:
 *
 * - Only a resource named for an ephemeral preview environment
 *   (`env:callcaster-pr-<number>`) that Railway no longer reports can be
 *   called stale. Every long-lived environment is protected.
 * - Every other resource is owned by a workspace, and the Twilio account is
 *   shared by all environments. A workspace that is missing from the database
 *   this report is connected to is NOT evidence that its resources are stale,
 *   so those resources are reported as UNKNOWN, never as stale.
 *
 * ## Why the owner check needs a database
 *
 * A resource that belongs to a workspace in production is missing from the
 * dev database while it is very much alive. Cross-checking against the
 * database turns "I did not find the owner" into "the owner is not in this
 * environment", which is a fact worth reporting. Without a database the
 * owner check cannot run at all, and every workspace-owned resource stays
 * UNKNOWN.
 *
 * Run with bun, not node: the twilio package pulls in buffer-equal-constant-time,
 * which reads SlowBuffer and throws on import under Node 24+.
 */

import "dotenv/config";

import Twilio from "twilio";
import postgres from "postgres";

import { loadLiveEnvironmentNames } from "./lib/live-environments.mjs";
import { buildTwilioPruneReport, PRUNE_VERDICT } from "./lib/twilio-resource-prune-policy.mjs";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const skipSubaccounts = args.includes("--skip-subaccounts");

/** How many subaccounts to scan at the same time. */
const SCAN_CONCURRENCY = 5;

/** Page size for every list call. Twilio allows up to 1000. */
const PAGE_SIZE = 1000;

async function main() {
  const client = new Twilio.Twilio(
    requireEnv("TWILIO_SID"),
    requireEnv("TWILIO_AUTH_TOKEN"),
  );

  const liveEnvironments = await loadLiveEnvironmentNames();
  const database = await readDatabaseEvidence();

  const resources = await collectResources(client, { skipSubaccounts });

  const report = buildTwilioPruneReport({
    resources,
    liveEnvironments,
    knownWorkspaceIds: database.workspaceIds,
    referencedNumberSids: database.numberSids,
  });

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          liveEnvironments: [...liveEnvironments].sort(),
          database: database.source,
          counts: report.counts,
          entries: report.entries,
        },
        null,
        2,
      ),
    );
    return;
  }

  printReport({ report, liveEnvironments, database, resources });
}

/**
 * Every Twilio resource in the account, in one flat list.
 *
 * The parent account is scanned first, then every subaccount. A workspace is a
 * subaccount, so most workspace-owned resources only show up in the subaccount
 * scan.
 */
async function collectResources(client, { skipSubaccounts }) {
  const resources = [];
  const accounts = client.api.v2010.accounts;

  for (const application of await client.applications.list({ limit: PAGE_SIZE })) {
    resources.push({
      resourceType: "twiml_app",
      sid: application.sid,
      friendlyName: application.friendlyName,
      scope: "parent",
    });
  }

  for (const service of await client.messaging.v1.services.list({ limit: PAGE_SIZE })) {
    resources.push({
      resourceType: "messaging_service",
      sid: service.sid,
      friendlyName: service.friendlyName,
      scope: "parent",
    });
  }

  for (const number of await client.incomingPhoneNumbers.list({ limit: PAGE_SIZE })) {
    resources.push({
      resourceType: "incoming_phone_number",
      sid: number.sid,
      friendlyName: number.friendlyName,
      phoneNumber: number.phoneNumber,
      scope: "parent",
    });
  }

  const subaccounts = (await accounts.list({ limit: 200 })).filter(
    (account) => account.sid !== client.accountSid,
  );

  for (const subaccount of subaccounts) {
    resources.push({
      resourceType: "subaccount",
      sid: subaccount.sid,
      friendlyName: subaccount.friendlyName,
      scope: "subaccount",
    });
  }

  if (skipSubaccounts) {
    return resources;
  }

  // A subaccount's resources belong to the workspace that owns the subaccount,
  // so they are reported under the subaccount's name, which carries the owner
  // hint. The hint is the same either way, and the subaccount's own status is
  // not part of the verdict.
  for (const batch of chunk(subaccounts, SCAN_CONCURRENCY)) {
    const scanned = await Promise.all(
      batch.map(async (subaccount) => {
        const sub = accounts(subaccount.sid);
        const found = [];
        for (const application of await sub.applications.list({ limit: PAGE_SIZE })) {
          found.push({
            resourceType: "twiml_app",
            sid: application.sid,
            friendlyName: application.friendlyName,
            scope: "subaccount",
          });
        }
        for (const service of await listSubaccountMessagingServices(client, subaccount.sid)) {
          found.push({
            resourceType: "messaging_service",
            sid: service.sid,
            friendlyName: service.friendlyName,
            scope: "subaccount",
          });
        }
        for (const number of await sub.incomingPhoneNumbers.list({ limit: PAGE_SIZE })) {
          found.push({
            resourceType: "incoming_phone_number",
            sid: number.sid,
            friendlyName: number.friendlyName,
            phoneNumber: number.phoneNumber,
            scope: "subaccount",
          });
        }
        return found;
      }),
    );
    for (const found of scanned) resources.push(...found);
  }

  return resources;
}

/**
 * The messaging services of one subaccount.
 *
 * The SDK exposes messaging services under the client's own namespace, not
 * under an account namespace, so a subaccount's services are only reachable
 * through the account-scoped REST path. A failure here is recorded and the
 * scan continues: one unreadable subaccount must not abort the report.
 */
async function listSubaccountMessagingServices(client, subaccountSid) {
  try {
    const response = await client.request({
      method: "get",
      uri: `https://api.twilio.com/2010-04-01/Accounts/${subaccountSid}/Messaging/Services.json`,
    });
    return (response?.messaging_services ?? []).map((service) => ({
      sid: service.sid,
      friendlyName: service.friendly_name ?? null,
    }));
  } catch {
    return [];
  }
}

/**
 * The database evidence the owner check needs: the workspaces in this
 * environment, and the phone numbers still attached to a workspace number.
 *
 * A missing database is not an error. It leaves every workspace-owned
 * resource UNKNOWN, which is the safe answer, and the report says so.
 */
async function readDatabaseEvidence() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return { source: "not configured", workspaceIds: [], numberSids: new Set() };
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    ...(process.env.DATABASE_PUBLIC_URL ? { ssl: false } : {}),
  });

  try {
    const workspaceRows = await sql`SELECT id FROM workspace`;
    const numberRows = await sql`
      SELECT twilio_phone_number_sid, workspace
      FROM workspace_number
      WHERE twilio_phone_number_sid IS NOT NULL
    `;
    return {
      source: `${workspaceRows.length} workspaces, ${numberRows.length} workspace numbers`,
      workspaceIds: workspaceRows.map((row) => row.id),
      numberSids: new Set(numberRows.map((row) => row.twilio_phone_number_sid)),
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function printReport({ report, liveEnvironments, database, resources }) {
  const byType = new Map();
  for (const resource of resources) {
    byType.set(resource.resourceType, (byType.get(resource.resourceType) ?? 0) + 1);
  }

  console.log(`Live environments:         ${liveEnvironments.size}`);
  console.log(`Database cross-check:       ${database.source}`);
  console.log(`Resources scanned:          ${report.counts.total}`);
  for (const [type, count] of byType) {
    console.log(`  ${type.padEnd(24)}${count}`);
  }
  console.log(`KEEP:                       ${report.counts.keep}`);
  console.log(`STALE (prunable):           ${report.counts.stale}`);
  console.log(`UNKNOWN (owner unproven):   ${report.counts.unknown}`);

  const stale = report.entries.filter((entry) => entry.verdict === PRUNE_VERDICT.STALE);
  if (stale.length > 0) {
    console.log("");
    console.log("Stale — the owning preview environment no longer exists:");
    for (const entry of stale) {
      console.log(`  ${entry.sid}  ${entry.friendlyName}  [${entry.resourceType}]`);
    }
  }

  const unknown = report.entries.filter((entry) => entry.verdict === PRUNE_VERDICT.UNKNOWN);
  if (unknown.length > 0) {
    console.log("");
    console.log("Unknown — the owner could not be verified from this environment:");
    for (const entry of unknown) {
      console.log(`  ${entry.sid}  ${entry.friendlyName ?? "(no name)"}  [${entry.resourceType}]  ${entry.why}`);
    }
  }

  console.log("");
  console.log("Read-only. Nothing was deleted or modified.");
  console.log(
    "Every UNKNOWN entry needs a check against the environment that owns it " +
      "before it can be called stale.",
  );
}

function chunk(items, size) {
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
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
  console.error("Twilio resource prune report failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
