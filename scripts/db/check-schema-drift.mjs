#!/usr/bin/env node
/* eslint-env node */
/**
 * Compare a live database against the Drizzle schema the application compiles
 * against, and report tables/columns the app expects but the database lacks.
 *
 * Written because three separate objects turned out to be missing from a live
 * database while every check was green:
 *   - claim_next_queue_contact (absent on the migrations lineage — dev),
 *   - the five ACD inbound RPCs (absent on the baseline lineage — production),
 *   - workspace_events (absent on dev, so SSE realtime silently dropped).
 *
 * Nothing caught them. `typecheck` cannot see into a database, tests run
 * against a bootstrap that builds the schema its own way, and
 * `db:ledger:check` compares migration *versions*, not their effects — and on
 * dev its ledger is stale, so it reports migrations as missing whose objects
 * are in fact present. Only asking the database what it actually has is
 * conclusive.
 *
 * Reports drift; it never writes.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/db/check-schema-drift.mjs
 *   DATABASE_URL=postgresql://... npm run db:schema:check
 */
import { join } from "node:path";
import postgres from "postgres";

import { collectCalledRpcs, collectSchemaTables } from "../lib/app-db-objects.mjs";

const ROOT = join(import.meta.dirname, "../..");

const expected = collectSchemaTables(ROOT);
if (expected.size === 0) {
  console.error("Parsed zero tables from the Drizzle schema — the parser is broken, not the database.");
  process.exit(2);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Point it at the environment to check.");
  process.exit(2);
}

const sql = postgres(connectionString, { max: 1, onnotice: () => {} });
let exitCode = 0;

try {
  const rows = await sql`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
  `;
  const actual = new Map();
  for (const row of rows) {
    if (!actual.has(row.table_name)) actual.set(row.table_name, new Set());
    actual.get(row.table_name).add(row.column_name);
  }

  const missingTables = [];
  const missingColumns = [];
  for (const [table, columns] of expected) {
    const present = actual.get(table);
    if (!present) {
      missingTables.push(table);
      continue;
    }
    const gone = columns.filter((c) => !present.has(c));
    if (gone.length > 0) missingColumns.push({ table, columns: gone });
  }

  // The other half: functions the app invokes must exist in THIS database.
  // check:db-rpcs proves some SQL in the repo creates them; only the database
  // can say whether this one ran it. The ACD inbound RPCs were missing from
  // production while present on dev, and nothing else would have shown that.
  const calledRpcs = collectCalledRpcs(ROOT);
  const presentFns = new Set(
    (
      await sql`
        select p.proname as name
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
      `
    ).map((r) => r.name),
  );
  const missingFunctions = [...calledRpcs.keys()].filter((fn) => !presentFns.has(fn)).sort();

  const host = connectionString.replace(/^.*@/, "").replace(/\/.*$/, "");
  console.log(
    `\nschema drift vs ${host} — ${expected.size} tables, ${calledRpcs.size} functions required by the app\n`,
  );

  if (missingTables.length === 0 && missingColumns.length === 0 && missingFunctions.length === 0) {
    console.log("  No drift: every table, column and function the app needs exists.\n");
  } else {
    exitCode = 1;
    for (const table of missingTables) {
      console.log(`  MISSING TABLE   ${table}`);
    }
    for (const { table, columns } of missingColumns) {
      console.log(`  MISSING COLUMNS ${table}: ${columns.join(", ")}`);
    }
    for (const fn of missingFunctions) {
      console.log(`  MISSING FUNCTION ${fn}()  — called from ${[...calledRpcs.get(fn)].join(", ")}`);
    }
    console.log(
      "\n  Every read or write the app makes against these fails at runtime.\n" +
        "  Add a migration under client/migrations/ that creates them.\n",
    );
  }
} finally {
  await sql.end();
}

process.exit(exitCode);
