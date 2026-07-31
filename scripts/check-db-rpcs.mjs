#!/usr/bin/env node
/* eslint-env node */
/**
 * Every Postgres function the application calls must be created by a migration.
 *
 * `claim_next_queue_contact` shipped without one. The application had been
 * calling it since #1091, no migration anywhere defined it, and every call
 * raised `function claim_next_queue_contact(integer, uuid) does not exist`.
 * Because that claim is reached from the Twilio status callback that chains the
 * next dial, the predictive dialer stopped after the first call of every
 * session — and nothing caught it: typecheck cannot see inside a SQL template,
 * no test exercises a dialer turn, and `db:ledger:check` compares migration
 * *versions*, not their contents.
 *
 * This closes that gap with no database: it parses the function names the app
 * invokes out of sql`` templates and checks each one is created somewhere in
 * the SQL that builds the schema.
 *
 * Usage: node scripts/check-db-rpcs.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const APP_DIRS = ["app", "worker", "services"];
const SQL_DIRS = ["drizzle", "client/migrations", "scripts/schema-transform"];

/** Not RPCs — SQL built-ins and clause keywords the call pattern can match. */
const SQL_BUILTINS = new Set([
  "count", "now", "sum", "min", "max", "avg", "coalesce", "nullif", "greatest",
  "least", "jsonb_build_object", "json_build_object", "to_jsonb", "array_agg",
  "jsonb_agg", "make_interval", "date_trunc", "extract", "generate_series",
  "unnest", "lower", "upper", "trim", "concat", "length", "cast", "exists",
  "row_number", "regexp_replace", "string_agg", "pg_sleep", "distinct", "case",
  "nextval", "currval", "setval", "gen_random_uuid", "uuid_generate_v4", "any",
  // Postgres built-ins the app calls directly.
  "pg_notify", "pg_advisory_xact_lock", "pg_advisory_lock", "set_config",
  "current_setting", "pg_try_advisory_lock", "to_regclass",
]);

function walk(dir, out = [], exts = [".ts", ".tsx"]) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out, exts);
    else if (exts.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

// ── What the app calls ────────────────────────────────────────────────
// Only inside sql`...` templates, so ordinary JS calls are never matched.
const called = new Map(); // name -> Set<file>
for (const dir of APP_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const src = readFileSync(file, "utf8");
    for (const tpl of src.match(/sql`[^`]*`/gs) ?? []) {
      for (const m of tpl.matchAll(/\b(?:from|select|call|perform)\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi)) {
        const name = m[1].toLowerCase();
        if (SQL_BUILTINS.has(name)) continue;
        if (!called.has(name)) called.set(name, new Set());
        called.get(name).add(file.slice(ROOT.length + 1));
      }
    }
  }
}

// ── What the SQL creates ──────────────────────────────────────────────
const created = new Set();
for (const dir of SQL_DIRS) {
  for (const file of walk(join(ROOT, dir), [], [".sql"])) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(
      /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi,
    )) {
      created.add(m[1].toLowerCase());
    }
  }
}

const missing = [...called.keys()].filter((name) => !created.has(name)).sort();

if (missing.length > 0) {
  console.error(
    `check-db-rpcs: ${missing.length} database function(s) are called by the app but created by no migration.\n`,
  );
  for (const name of missing) {
    console.error(`  ${name}()`);
    for (const file of [...called.get(name)].sort()) console.error(`      called from ${file}`);
  }
  console.error(
    "\nEach of these throws `function ... does not exist` at runtime.\n" +
      "Add a migration under client/migrations/ that creates it, or point the\n" +
      "call at the function that actually exists.",
  );
  process.exit(1);
}

console.log(
  `check-db-rpcs: ${called.size} app-invoked database function(s), all created by migrations.`,
);
