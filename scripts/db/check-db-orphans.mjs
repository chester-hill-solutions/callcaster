#!/usr/bin/env node
/* eslint-env node */
/**
 * Fail when a database function survives migration replay with no caller.
 *
 * check-db-rpcs.mjs asserts called ⊆ created. Nothing asserted the reverse,
 * which is how ~45 Supabase-era orphans — including a publicly-executable
 * SECURITY DEFINER contact hard-delete — survived three remediation passes
 * (#1229). This check computes the survivor set (created and never dropped,
 * in bootstrap apply order), subtracts functions the app calls, functions
 * other surviving SQL uses (trigger bodies, PERFORM/SELECT inside functions),
 * and a named allowlist. Anything left fails the build.
 *
 * To fix a failure: drop the function in a new client/migrations file, or —
 * if it is deliberately kept — add it to KEEP with a reason.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { collectCalledRpcs } from "../lib/app-db-objects.mjs";

const ROOT = join(import.meta.dirname, "../..");

/**
 * Deliberately-kept functions with no app caller. Every entry needs a reason;
 * shrinking this list is progress, growing it is a review decision.
 */
const KEEP = new Map([
  // Unreachable-but-working reporting/export RPCs pending a keep/drop product
  // decision (#1229 rank 4). They reference only live columns.
  ["get_basic_results", "legacy reporting RPC, pending decision"],
  ["get_calls_by_campaign", "legacy reporting RPC, pending decision"],
  ["get_campaign_attempts_chunk", "legacy export RPC, pending decision"],
  ["get_campaign_attempts_count", "legacy export RPC, pending decision"],
  ["get_campaign_audience_contacts", "legacy reporting RPC, pending decision"],
  ["get_campaign_messages_count", "legacy export RPC, pending decision"],
  ["get_campaigns_by_workspace", "legacy reporting RPC, pending decision"],
  ["get_contacts_by_audience", "legacy reporting RPC, pending decision"],
  ["get_conversation_summary_by_campaign", "legacy reporting RPC, pending decision"],
  ["get_dynamic_outreach_results", "legacy reporting RPC, pending decision"],
  ["get_outreach_attempts", "legacy reporting RPC, pending decision"],
  ["get_outreach_results", "legacy reporting RPC, pending decision"],
  ["get_survey_results", "legacy reporting RPC, pending decision"],
  ["get_conversation_summary", "legacy reporting RPC, pending decision"],
  ["execute_jsonb_columns", "legacy dynamic-report helper, pending decision"],
  ["generate_jsonb_columns", "legacy dynamic-report helper, pending decision"],
  ["update_column_value", "legacy dynamic-report helper, pending decision"],
  ["seed_ontario_survey", "legacy seed, pending decision"],
  ["count_active_ivr_campaign_calls", "legacy IVR helper, pending decision"],
  // Queue helpers whose only exercise is the throughput integration test.
  ["complete_campaign_queue_contact", "test-exercised queue helper, pending decision"],
  ["dequeue_duplicate_campaign_queue_contact", "test-exercised queue helper, pending decision"],
  ["dequeue_household", "test-exercised queue helper, pending decision"],
  ["requeue_campaign_queue_contact", "test-exercised queue helper, pending decision"],
  ["claim_campaign_queue_contacts", "test-exercised queue helper, pending decision"],
  ["get_campaign_calls", "legacy reporting RPC, pending decision"],
  ["get_outreach_data_column_definitions", "legacy dynamic-report helper, pending decision"],
  ["get_outreach_data_column_names", "legacy dynamic-report helper, pending decision"],
  ["get_outreach_data_column_structure", "legacy dynamic-report helper, pending decision"],
  ["get_pivoted_outreach_data", "legacy dynamic-report helper, pending decision"],
  // CHS workspace-membership infrastructure (20260713180000): awaits its
  // @chester-hill-solutions package consumers, not a Supabase-era orphan.
  ["check_workspace_feature_permission", "CHS feature-permission helper, consumer packages pending"],
]);

/** SQL files in bootstrap apply order: drizzle/* then client/migrations/*. */
function appliedSqlFiles() {
  const list = (dir) =>
    readdirSync(join(ROOT, dir))
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => join(ROOT, dir, f));
  return [...list("drizzle"), ...list("client/migrations")];
}

const files = appliedSqlFiles();

// Survivor set: replay CREATE/DROP statements in order, name granularity.
// An overloaded name survives if any overload survives — fine for a ratchet.
const alive = new Set();
const CREATE_RE = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.|app_auth\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi;
const DROP_RE = /drop\s+function\s+(?:if\s+exists\s+)?(?:public\.|app_auth\.)?"?([a-z_][a-z0-9_]*)"?/gi;

const sources = files.map((f) => readFileSync(f, "utf8"));
for (const src of sources) {
  const events = [];
  for (const m of src.matchAll(CREATE_RE)) events.push({ at: m.index, name: m[1].toLowerCase(), kind: "create" });
  for (const m of src.matchAll(DROP_RE)) events.push({ at: m.index, name: m[1].toLowerCase(), kind: "drop" });
  events.sort((a, b) => a.at - b.at);
  for (const e of events) {
    if (e.kind === "create") alive.add(e.name);
    else alive.delete(e.name);
  }
}

// Functions the app calls.
const called = new Set(collectCalledRpcs(ROOT).keys());

// Functions other surviving SQL uses: trigger EXECUTE FUNCTION, or the name
// appearing inside another statement (PERFORM/SELECT within bodies). Counted
// as any occurrence beyond the function's own CREATE/DROP statements.
// Strip SQL comments first: pg_dump headers like `-- Name: fn(args)` would
// otherwise count as uses of every function in the baseline.
const allSql = sources
  .join("\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");
function usedInsideSql(name) {
  const occurrences = [...allSql.matchAll(new RegExp(`\\b${name}\\s*\\(`, "gi"))].length;
  // Only CREATE/DROP count as definitions — a bare `EXECUTE FUNCTION name()`
  // in a trigger is a USE and must not cancel out.
  const definitions =
    [...allSql.matchAll(new RegExp(`(?:create\\s+(?:or\\s+replace\\s+)?|drop\\s+(?:if\\s+exists\\s+)?)function\\s+(?:if\\s+exists\\s+)?(?:public\\.|app_auth\\.)?"?${name}"?\\s*\\(`, "gi"))].length;
  return occurrences > definitions;
}

const orphans = [...alive]
  .filter((name) => !called.has(name))
  .filter((name) => !KEEP.has(name))
  .filter((name) => !usedInsideSql(name))
  .sort();

if (orphans.length > 0) {
  console.error(
    "Orphaned database function(s): created by repo SQL, never dropped, and " +
      "called by nothing —\n\n" +
      orphans.map((n) => `  ${n}`).join("\n") +
      "\n\nDrop each in a new client/migrations file, or add it to KEEP in " +
      "scripts/db/check-db-orphans.mjs with a reason.",
  );
  process.exit(1);
}

// Allowlist hygiene: entries that are no longer orphans (dropped, or gained a
// caller) must be removed so the list only ever shrinks meaningfully.
const staleKeeps = [...KEEP.keys()].filter(
  (name) => !alive.has(name) || called.has(name) || usedInsideSql(name),
);
if (staleKeeps.length > 0) {
  console.error(
    "Stale KEEP entries in check-db-orphans.mjs (no longer orphans):\n" +
      staleKeeps.map((n) => `  ${n}`).join("\n") +
      "\nRemove them so the allowlist only shrinks.",
  );
  process.exit(1);
}

console.log(
  `db-orphans OK: ${alive.size} surviving function(s), ${orphans.length} orphaned, ` +
    `${KEEP.size} allowlisted pending decision.`,
);
