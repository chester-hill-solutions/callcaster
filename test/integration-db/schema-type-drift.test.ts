import postgres from "postgres";
import { beforeAll, describe, expect, test } from "vitest";

import {
  compareModelToDatabase,
  databaseUrl,
  driftKeys,
  freshEntries,
  skipBanner,
  staleEntries,
  writeBaseline,
  type ModelComparison,
} from "../helpers/schema-drift";

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
 * The comparison, the model walk and the baseline handling live in
 * `test/helpers/schema-drift.ts`, shared with the defaults guard (#2243). Only
 * the predicate is here.
 *
 * Regenerate the baseline after correcting columns, deliberately:
 *
 *   SCHEMA_DRIFT_UPDATE=1 npm run test:integration-db
 */

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

const client = databaseUrl() ? postgres(databaseUrl() as string, { max: 1 }) : null;

let comparison: ModelComparison;
const drifts: string[] = [];

beforeAll(async () => {
  if (!client) {
    process.stderr.write(skipBanner("schema-type-drift"));
    comparison = await compareModelToDatabase(null);
    return;
  }

  comparison = await compareModelToDatabase(client);

  for (const column of comparison.columns) {
    if (isDrift(column.drizzleType, column.dbType)) {
      drifts.push(`${column.key}: ${column.drizzleType} -> ${column.dbType}`);
    }
  }

  drifts.sort();
});

describe("Drizzle temporal columns match the database (#2213)", () => {
  test("the comparison set is not vacuous", () => {
    if (comparison.skipReason) return;
    expect(
      comparison.compared,
      `only compared ${comparison.compared} columns (${comparison.absent} absent from this database). It looks ` +
        `stale or partially migrated — apply client/migrations before trusting this ` +
        `result, or this guard has just proved nothing.`,
    ).toBeGreaterThan(400);
  });

  test.skipIf(UPDATE)("no column has started lying about being text", () => {
    if (comparison.skipReason) return;
    const fresh = freshEntries(drifts, BASELINE_PATH);

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
    if (comparison.skipReason) return;
    const stale = staleEntries(BASELINE_PATH, driftKeys(drifts));

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
    if (comparison.skipReason) return;
    if (UPDATE) {
      writeBaseline(BASELINE_PATH, drifts);
      process.stderr.write(`\nschema-type-drift baseline written: ${drifts.length} column(s).\n`);
      return;
    }
    // Printed on every run, so the count is never a claim in an issue body that
    // nobody re-measured.
    process.stderr.write(
      `\nschema-type-drift: compared ${comparison.compared} columns across the Drizzle model; ` +
        `${drifts.length} lie about being text (${comparison.absent} absent from this database).\n`,
    );
  });
});