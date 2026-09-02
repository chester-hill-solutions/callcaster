#!/usr/bin/env node
/* eslint-env node */
/**
 * Compare a live database against the Drizzle schema the application compiles
 * against, and report tables, columns, enum values and functions the app
 * expects but the database lacks.
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
 * Enum values (#1475): every `pgEnum(name, [...])` in the schema is compared
 * against `pg_enum`. A value declared in schema.ts but absent from the
 * database FAILS the check — the app writes it and Postgres rejects the row,
 * which is how `'waiting'` in `campaign_status` dead-lettered
 * campaign_schedule_sync on every environment. A value only the database has
 * is reported as a WARNING and does not fail the check.
 *
 * Reports drift; it never writes.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/db/check-schema-drift.mjs
 *   DATABASE_URL=postgresql://... npm run db:schema:check
 */
import { join } from "node:path";
import postgres from "postgres";

import {
  collectCalledRpcs,
  collectSchemaEnums,
  collectSchemaTables,
  diffEnums,
} from "../lib/app-db-objects.mjs";

const ROOT = join(import.meta.dirname, "../..");

const expected = collectSchemaTables(ROOT);
if (expected.size === 0) {
  console.error("Parsed zero tables from the Drizzle schema — the parser is broken, not the database.");
  process.exit(2);
}
const expectedEnums = collectSchemaEnums(ROOT);
if (expectedEnums.size === 0) {
  console.error("Parsed zero enums from the Drizzle schema — the parser is broken, not the database.");
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

  // Enum values. information_schema exposes enum *types* but not their
  // labels; only pg_enum has those, in the order Postgres sorts them.
  const enumRows = await sql`
    select t.typname as name, e.enumlabel as value
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    join pg_enum e on e.enumtypid = t.oid
    where n.nspname = 'public' and t.typtype = 'e'
    order by t.typname, e.enumsortorder
  `;
  const actualEnums = new Map();
  for (const row of enumRows) {
    if (!actualEnums.has(row.name)) actualEnums.set(row.name, []);
    actualEnums.get(row.name).push(row.value);
  }
  const { missingEnums, missingValues, extraValues } = diffEnums(expectedEnums, actualEnums);

  const host = connectionString.replace(/^.*@/, "").replace(/\/.*$/, "");
  console.log(
    `\nschema drift vs ${host} — ${expected.size} tables, ${expectedEnums.size} enums, ${calledRpcs.size} functions required by the app\n`,
  );

  const failing =
    missingTables.length + missingColumns.length + missingFunctions.length +
    missingEnums.length + missingValues.length;
  if (failing === 0) {
    console.log("  No drift: every table, column, enum value and function the app needs exists.\n");
  } else {
    exitCode = 1;
    for (const table of missingTables) {
      console.log(`  MISSING TABLE   ${table}`);
    }
    for (const { table, columns } of missingColumns) {
      console.log(`  MISSING COLUMNS ${table}: ${columns.join(", ")}`);
    }
    for (const name of missingEnums) {
      console.log(`  MISSING ENUM    ${name}`);
    }
    for (const { name, values } of missingValues) {
      console.log(`  MISSING ENUM VALUES ${name}: ${values.map((v) => `'${v}'`).join(", ")}`);
    }
    for (const fn of missingFunctions) {
      console.log(`  MISSING FUNCTION ${fn}()  — called from ${[...calledRpcs.get(fn)].join(", ")}`);
    }
    console.log(
      "\n  Every read or write the app makes against these fails at runtime.\n" +
        "  Add a migration under client/migrations/ that creates them\n" +
        "  (ALTER TYPE ... ADD VALUE IF NOT EXISTS for enum values).\n",
    );
  }
  for (const { name, values } of extraValues) {
    console.log(
      `  WARN extra enum values ${name}: ${values.map((v) => `'${v}'`).join(", ")}  — in the database, not in schema.ts`,
    );
  }
  if (extraValues.length > 0) console.log("");
} finally {
  await sql.end();
}

process.exit(exitCode);
