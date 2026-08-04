import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { householdKeyFor } from "../app/lib/household-key";

/**
 * app/lib/household-key.ts (TS) and public.household_key_for (SQL, defined in
 * client/migrations/20260722100000_households_backfill.sql) are twin
 * implementations of the household-key normalization: the app derives keys at
 * contact-creation time while the migration backfill (and any future SQL-side
 * grouping) derives them in Postgres. If they drift, contacts silently land in
 * different households depending on which code path touched them.
 *
 * This suite runs both implementations over the same fixture set against a
 * real Postgres (the docker-compose stack used by `npm run test:e2e:compose`).
 * It self-skips when no reachable Postgres is configured, matching
 * test/workspace-conversations-sql-parity.test.ts — run
 * `docker compose -f docker-compose.dev.yml up -d postgres` and set
 * PARITY_DATABASE_URL (or DATABASE_URL) to exercise it locally.
 */

const CANDIDATE_URL =
  process.env.PARITY_DATABASE_URL ??
  (process.env.DATABASE_URL?.includes("localhost:5432/test")
    ? undefined
    : process.env.DATABASE_URL) ??
  "postgresql://callcaster:callcaster@127.0.0.1:5433/callcaster";

/** [address, postal] pairs covering every normalization rule. */
const FIXTURES: Array<[string | null, string | null]> = [
  // Mixed case + punctuation.
  ["123 Main St., Apt #4", "M5V 2T6"],
  ["123  MAIN st apt 4", "m5v2t6"],
  ["123 Main St, Apt 4", "M5V-2T6"],
  // Unicode accents: non-[a-z0-9] chars become spaces in BOTH implementations.
  ["Élysée Blvd", "90210"],
  ["10—12 Rue de l'Église", "H2X 1Y6"],
  // Postal formats.
  ["1 A St", "M5V 2T6"],
  ["1 A St", "m5v2t6"],
  ["1 A St", "90210"],
  // Empty / null / normalizes-to-empty combinations.
  [null, null],
  ["", "M5V 2T6"],
  ["123 Main St", ""],
  [null, "M5V 2T6"],
  ["123 Main St", null],
  ["   ", "M5V 2T6"],
  ["!!!---", "M5V 2T6"],
  ["123 Main St", " -- "],
  // Whitespace runs and edge whitespace.
  ["  42   Oak\tAve  ", "K1A 0B1"],
];

describe("household_key_for SQL/TS parity (real Postgres)", () => {
  let reachable = false;
  let sqlClient: import("postgres").Sql | undefined;

  beforeAll(async () => {
    let postgres: typeof import("postgres");
    try {
      postgres = (await import("postgres")).default;
    } catch {
      return;
    }

    // max: 1 — the migration file is applied verbatim below and contains
    // BEGIN/COMMIT, which postgres.js only allows on a single-connection pool.
    const client = postgres(CANDIDATE_URL, { prepare: false, max: 1, connect_timeout: 2 });
    try {
      await client`select 1`;
    } catch {
      await client.end({ timeout: 1 }).catch(() => {});
      return;
    }

    sqlClient = client;

    // Apply the migration so the SQL function under test is the file's exact
    // text (the whole migration is idempotent: CREATE OR REPLACE + ON
    // CONFLICT DO NOTHING + household_id-is-null-guarded UPDATE).
    const migrationSql = readFileSync(
      path.resolve(__dirname, "../client/migrations/20260722100000_households_backfill.sql"),
      "utf8",
    );
    await client.unsafe(migrationSql);

    reachable = true;
  }, 15_000);

  afterAll(async () => {
    if (!sqlClient) return;
    await sqlClient.end({ timeout: 2 });
  });

  function assertSkippedWithoutDb(ctx: { skip: () => void }) {
    if (!reachable) {
      ctx.skip();
    }
  }

  test("SQL household_key_for matches TS householdKeyFor on every fixture", async (ctx) => {
    assertSkippedWithoutDb(ctx);

    for (const [address, postal] of FIXTURES) {
      const [row] = await sqlClient!`
        select public.household_key_for(${address}, ${postal}) as key
      `;
      const sqlKey = (row as { key: string | null }).key;
      const tsKey = householdKeyFor(address, postal);
      expect(sqlKey, `address=${JSON.stringify(address)} postal=${JSON.stringify(postal)}`).toBe(
        tsKey,
      );
    }
  });

  test("equivalent formattings produce one shared key, distinct addresses do not", async (ctx) => {
    assertSkippedWithoutDb(ctx);

    const [same] = await sqlClient!`
      select
        public.household_key_for('123 Main St., Apt #4', 'M5V 2T6') =
        public.household_key_for('123  MAIN st apt 4', 'm5v2t6') as matches
    `;
    expect((same as { matches: boolean }).matches).toBe(true);

    const [different] = await sqlClient!`
      select
        public.household_key_for('123 Main St', '90210') is distinct from
        public.household_key_for('124 Main St', '90210') as differs
    `;
    expect((different as { differs: boolean }).differs).toBe(true);
  });
});
