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

import { collectResources } from "./lib/twilio-prune-resources.mjs";
import { loadLiveEnvironmentNames } from "./lib/live-environments.mjs";
import { buildTwilioPruneReport, PRUNE_VERDICT } from "./lib/twilio-resource-prune-policy.mjs";
import {
  TWILIO_PRUNE_KEEP_NAMES,
  TWILIO_PRUNE_KEEP_OWNER_PREFIXES,
  TWILIO_PRUNE_KEEP_PHONE_NUMBERS,
  TWILIO_PRUNE_KEEP_SIDS,
} from "./twilio-resource-prune-keep-list.mjs";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const skipSubaccounts = args.includes("--skip-subaccounts");

/**
 * A workspace counts as active when it has done something in this window.
 * Activity only ever holds a resource. It never makes one prunable.
 */
const ACTIVE_WINDOW_DAYS = 30;

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
    knownWorkspaceNames: database.workspaceNames,
    activeWorkspacePrefixes: database.activeWorkspacePrefixes,
    referencedNumberSids: database.numberSids,
    keepSids: TWILIO_PRUNE_KEEP_SIDS,
    keepNames: TWILIO_PRUNE_KEEP_NAMES,
    keepPhoneNumbers: TWILIO_PRUNE_KEEP_PHONE_NUMBERS,
    keepOwnerPrefixes: TWILIO_PRUNE_KEEP_OWNER_PREFIXES,
  });

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          liveEnvironments: [...liveEnvironments].sort(),
          database: database.source,
          accounts: database.accounts,
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
 * The database evidence the owner check needs: the workspaces in this
 * environment, and the phone numbers still attached to a workspace number.
 *
 * A missing database is not an error. It leaves every workspace-owned
 * resource UNKNOWN, which is the safe answer, and the report says so.
 */
async function readDatabaseEvidence() {
  // The public URL wins: DATABASE_URL on a Railway service points at the
  // internal host, which is not reachable from a laptop.
  const databaseUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    return {
      source: "not configured",
      workspaceIds: [],
      workspaceNames: new Map(),
      activeWorkspacePrefixes: new Set(),
      numberSids: new Set(),
      accounts: [],
    };
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    ...(process.env.DATABASE_PUBLIC_URL ? { ssl: false } : {}),
  });

  try {
    // One query, shaped like scripts/cull-report.mjs, which already reads
    // these tables: a workspace with no activity still has to appear.
    const accountRows = await sql.unsafe(`
      WITH act AS (
        SELECT w.id,
               GREATEST(max(c.date_created), max(m.date_created), max(camp.created_at)) AS last_any
        FROM workspace w
        LEFT JOIN call c        ON c.workspace = w.id
        LEFT JOIN message m     ON m.workspace = w.id
        LEFT JOIN campaign camp ON camp.workspace = w.id
        GROUP BY w.id
      ),
      nums AS (
        SELECT workspace,
               count(*) FILTER (WHERE type = 'rented')::int    AS rented,
               count(*) FILTER (WHERE type = 'caller_id')::int AS caller_id,
               count(*)::int                                   AS total
        FROM workspace_number
        GROUP BY workspace
      )
      SELECT w.id, w.name,
             act.last_any::text AS last_any,
             COALESCE(nums.total, 0)::int     AS numbers_total,
             COALESCE(nums.rented, 0)::int    AS rented,
             COALESCE(nums.caller_id, 0)::int AS caller_id
      FROM workspace w
      LEFT JOIN act  ON act.id = w.id
      LEFT JOIN nums ON nums.workspace = w.id
      ORDER BY act.last_any DESC NULLS LAST, w.name
    `);

    const numberRows = await sql`
      SELECT twilio_phone_number_sid, workspace
      FROM workspace_number
      WHERE twilio_phone_number_sid IS NOT NULL
    `;

    const cutoff = Date.now() - ACTIVE_WINDOW_DAYS * 86_400_000;
    const accounts = accountRows.map((row) => {
      const lastActivity = row.last_any ? new Date(row.last_any) : null;
      const active = lastActivity ? lastActivity.getTime() >= cutoff : false;
      return {
        id: row.id,
        name: row.name,
        lastActivity: lastActivity ? lastActivity.toISOString() : null,
        active,
        numbersTotal: row.numbers_total,
        rented: row.rented,
        callerId: row.caller_id,
      };
    });

    const workspaceNames = new Map(
      accountRows.map((row) => [String(row.name ?? "").trim().toLowerCase(), row]),
    );

    return {
      source: `${accountRows.length} workspaces, ${numberRows.length} workspace numbers`,
      workspaceIds: accountRows.map((row) => row.id),
      workspaceNames,
      activeWorkspacePrefixes: new Set(
        accounts.filter((account) => account.active).map((account) => account.id.slice(0, 8).toLowerCase()),
      ),
      numberSids: new Set(numberRows.map((row) => row.twilio_phone_number_sid)),
      accounts,
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

  if (database.accounts.length > 0) {
    console.log("");
    console.log(`Accounts in this environment (active in the last ${ACTIVE_WINDOW_DAYS} days):`);
    for (const account of database.accounts) {
      const flag = account.active ? "ACTIVE" : "idle  ";
      const last = account.lastActivity ? account.lastActivity.slice(0, 10) : "never";
      console.log(
        `  ${flag}  ${account.id.slice(0, 8)}  ${pad(account.name, 42)}  numbers=${String(account.numbersTotal).padStart(2)}  last=${last}`,
      );
    }
  }

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


function pad(value, width) {
  return String(value ?? "—").slice(0, width).padEnd(width);
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
