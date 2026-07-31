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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const ROOT = join(import.meta.dirname, "../..");
const SCHEMA_FILES = [
  "app/db/schema.ts",
  "app/db/auth-schema.ts",
  "app/db/schema-transcription.ts",
];

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Point it at the environment to check.");
  process.exit(2);
}

/**
 * Parse `pgTable("name", { ... })` blocks.
 *
 * A column's database name is the explicit first string argument when present
 * (`emailVerified: boolean("email_verified")`) and otherwise the property key.
 * Getting this wrong reports every camelCase Better Auth column as missing.
 */
function parseSchema() {
  const tables = new Map();
  for (const relPath of SCHEMA_FILES) {
    let src;
    try {
      src = readFileSync(join(ROOT, relPath), "utf8");
    } catch {
      continue;
    }
    const tableRe = /pgTable\(\s*\n?\s*"([a-z_0-9]+)"\s*,\s*\{([\s\S]*?)\n\s*\}\s*[,)]/g;
    let match;
    while ((match = tableRe.exec(src))) {
      const [, tableName, body] = match;
      const columns = [];
      const colRe = /^\s{2,}(?:\/\*\*[\s\S]*?\*\/\s*)?([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([a-zA-Z_]+)\s*\(\s*("([^"]+)")?/gm;
      let col;
      while ((col = colRe.exec(body))) {
        const [, key, , , explicitName] = col;
        if (["columns", "where", "with", "extras"].includes(key)) continue;
        columns.push(explicitName ?? key);
      }
      tables.set(tableName, [...new Set(columns)]);
    }
  }
  return tables;
}

const expected = parseSchema();
if (expected.size === 0) {
  console.error("Parsed zero tables from the Drizzle schema — the parser is broken, not the database.");
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

  const host = connectionString.replace(/^.*@/, "").replace(/\/.*$/, "");
  console.log(`\nschema drift vs ${host} — ${expected.size} tables in the Drizzle schema\n`);

  if (missingTables.length === 0 && missingColumns.length === 0) {
    console.log("  No drift: every table and column the app compiles against exists.\n");
  } else {
    exitCode = 1;
    for (const table of missingTables) {
      console.log(`  MISSING TABLE   ${table}`);
    }
    for (const { table, columns } of missingColumns) {
      console.log(`  MISSING COLUMNS ${table}: ${columns.join(", ")}`);
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
