import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { getTableColumns, is, Table } from "drizzle-orm";
import postgres from "postgres";
import { beforeAll, describe, expect, test } from "vitest";

import * as schema from "@/db/schema";

/**
 * The Drizzle model must not lie about temporal columns (#2213).
 *
 * `app/db/schema.ts` is hand-synced from the migration lineage, so it can drift
 * from the database, and for a large set of columns it does: declared `text()`
 * in TypeScript, `timestamp with time zone` in every real database.
 *
 * That lie has a history. #2174's motivating incident was
 * `call.date_created` — repaired in application code, schema untouched — and
 * the repair left this comment behind at
 * `app/lib/call-recording-repair.server.ts`:
 *
 *   An uncast ISO literal is type `unknown`, so Postgres coerces it to match
 *   the column and the comparison is already correct. Only a text COLUMN on
 *   the right-hand side would fail, with no matching operator.
 *
 * So the drift is not currently breaking anything. What it costs is that
 * TypeScript cannot catch a wrong comparison across the boundary, because it
 * believes the lie, and all but one of these columns have no documented cast at
 * all — they are correct only by the accident described above.
 *
 * This guard closes the measurement gap. It compares the Drizzle model against
 * a real database, column by column, and fails on drift the baseline does not
 * already record. Two directions matter, so both are baselined:
 *
 *   NEW drift        a column that has started lying          → fail
 *   RESOLVED drift   a baselined column that stopped lying   → fail
 *
 * The second is what makes this a ratchet rather than a snapshot: correcting a
 * table is not allowed to leave a stale line behind, because the next
 * regression on that column would match the old entry and pass.
 *
 * Regenerate the baseline after correcting columns, deliberately:
 *
 *   SCHEMA_DRIFT_UPDATE=1 npm run test:integration-db
 */

const DATABASE_URL = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const BASELINE_PATH = "scripts/baselines/schema-type-drift.txt";
const UPDATE = process.env.SCHEMA_DRIFT_UPDATE === "1";

/**
 * Only a text/temporal mismatch counts as drift.
 *
 * A wider comparison would be noisier than it is useful: a hand-synced model
 * legitimately differs from the database in `serial` vs `integer` plus a
 * sequence default, `numeric(12,2)` formatting, and enum spellings. None of
 * those make the model lie in a way that breaks a comparison at runtime. A
 * `text` column where the database has a timestamp does, and it is the exact
 * shape behind #2174 and the silent guard failure in #2208.
 */
const TEMPORAL = /^timestamp( with time zone)?( \(\d\))?$/;
const TEXT = "text";

function isDrift(drizzleType: string, dbType: string): boolean {
  if (drizzleType === dbType) return false;
  return (
    (drizzleType === TEXT && TEMPORAL.test(dbType)) ||
    (dbType === TEXT && TEMPORAL.test(drizzleType))
  );
}

const client = DATABASE_URL ? postgres(DATABASE_URL, { max: 1 }) : null;

const drifts: string[] = [];
let compared = 0;
let absent = 0;

beforeAll(async () => {
  if (!client) {
    // Straight to stderr on purpose: vitest's console interceptor swallows
    // module-scope console.warn, and a guard that skips quietly is a guard
    // nobody runs. Same rule as the ledger suite.
    process.stderr.write(
      [
        "",
        "!".repeat(72),
        "!! schema-type-drift SKIPPED: no INTEGRATION_DB_URL / DATABASE_URL set.",
        "!! The guard did not run. A database is required to compare the",
        "!! Drizzle model against anything real.",
        "!".repeat(72),
        "",
      ].join("\n"),
    );
    return;
  }

  // `format_type` renders in the same vocabulary as Drizzle's `getSQLType()` —
  // "text", "timestamp with time zone", "integer" — so the two are comparable
  // as strings. `information_schema.data_type` uses a different vocabulary and
  // would not compare, which is why it is not used here.
  const rows = await client<{ table_name: string; column_name: string; db_type: string }[]>`
    select c.relname as table_name,
           a.attname as column_name,
           format_type(a.atttypid, a.atttypmod) as db_type
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and a.attnum > 0
       and not a.attisdropped
       and c.relkind in ('r', 'p')
  `;

  const actual = new Map<string, string>();
  for (const row of rows) actual.set(`${row.table_name}.${row.column_name}`, row.db_type);

  for (const value of Object.values(schema)) {
    if (!is(value as never, Table)) continue;
    const tableName = (value as unknown as { [k: symbol]: unknown })[
      Symbol.for("drizzle:Name")
    ] as string;

    for (const [columnName, column] of Object.entries(getTableColumns(value as never))) {
      const key = `${tableName}.${columnName}`;
      const dbType = actual.get(key);
      // Absent from this database: an unapplied migration, not a type lie.
      // Counted, and asserted on below, so a stale database cannot make this
      // guard pass by comparing nothing.
      if (dbType === undefined) {
        absent += 1;
        continue;
      }
      const drizzleType = (column as unknown as { getSQLType: () => string }).getSQLType();
      compared += 1;
      if (isDrift(drizzleType, dbType)) drifts.push(`${key}: ${drizzleType} -> ${dbType}`);
    }
  }

  drifts.sort();
});

/** `table.column` for each recorded baseline line. */
function recordedKeys(): string[] {
  if (!existsSync(BASELINE_PATH)) return [];
  return readFileSync(BASELINE_PATH, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.slice(0, line.indexOf(":")));
}

describe("Drizzle temporal columns match the database (#2213)", () => {
  test("the comparison set is not vacuous", () => {
    if (!client) return;
    expect(
      compared,
      `only compared ${compared} columns (${absent} absent from this database). It looks ` +
        `stale or partially migrated — apply client/migrations before trusting this ` +
        `result, or this guard has just proved nothing.`,
    ).toBeGreaterThan(400);
  });

  test.skipIf(UPDATE)("no column has started lying about being text", () => {
    if (!client) return;
    const recorded = new Set(recordedKeys());
    const fresh = drifts.filter((line) => !recorded.has(line.slice(0, line.indexOf(":"))));

    expect(
      fresh,
      fresh.length
        ? `${fresh.length} column(s) are declared text() where the database has a timestamp.\n` +
            `Correct the Drizzle model, or accept them deliberately by regenerating the\n` +
            `baseline with SCHEMA_DRIFT_UPDATE=1. Issue #2213 has the per-table slicing plan.`
        : "",
    ).toEqual([]);
  });

  test.skipIf(UPDATE)("no baselined column has stopped lying", () => {
    if (!client) return;
    const stillDrifting = new Set(drifts.map((line) => line.slice(0, line.indexOf(":"))));
    const stale = recordedKeys().filter((key) => !stillDrifting.has(key));

    expect(
      stale,
      stale.length
        ? `${stale.length} baselined column(s) no longer drift. Drop them from ` +
            `${BASELINE_PATH}: a stale entry would let the next regression on that column ` +
            `match it and pass.`
        : "",
    ).toEqual([]);
  });

  test("report", () => {
    if (!client) return;
    if (UPDATE) {
      mkdirSync("scripts/baselines", { recursive: true });
      writeFileSync(BASELINE_PATH, `${drifts.map((l) => `${l}\n`).join("")}`);
      process.stderr.write(`\nschema-type-drift baseline written: ${drifts.length} column(s).\n`);
      return;
    }
    // Printed on every run, so the count is never a claim in an issue body that
    // nobody re-measured.
    process.stderr.write(
      `\nschema-type-drift: compared ${compared} columns across the Drizzle model; ` +
        `${drifts.length} lie about being text (${absent} absent from this database).\n`,
    );
  });
});
