/**
 * Shared machinery for the schema-drift guards in `test/integration-db/`.
 *
 * Two guards live here — `schema-type-drift.test.ts` (#2213) and
 * `schema-default-drift.test.ts` (#2243) — and they need the same three things:
 * the same real-database query, the same walk of the Drizzle model, and the same
 * baseline read/write with a stale-entry check. Only the *predicate* differs, so
 * only the predicate lives in each guard.
 *
 * Not a test file, so the integration project's `*.test.ts` include will not
 * pick it up.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { getTableColumns, is, Table } from "drizzle-orm";
import postgres from "postgres";

import * as schema from "@/db/schema";

export type ColumnComparison = {
  /** `table.column`. */
  key: string;
  /** `format_type(...)` — the same vocabulary as Drizzle's `getSQLType()`. */
  drizzleType: string;
  dbType: string;
  /**
   * The Drizzle default rendered to a string, or null when the model declares
   * none. `generatedByDefaultAsIdentity()` is deliberately null: an identity
   * column reports `column_default = null` in `information_schema`, so the two
   * sides agree that there is nothing to compare.
   */
  drizzleDefault: string | null;
  /** `information_schema.columns.column_default`, verbatim. */
  dbDefault: string | null;
};

export type ModelComparison = {
  columns: ColumnComparison[];
  /** Columns present in both the model and the database. */
  compared: number;
  /** Model columns missing from this database — an unapplied migration. */
  absent: number;
  /** Non-null when no database was available and nothing was compared. */
  skipReason: string | null;
};

export function databaseUrl(): string | undefined {
  return process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
}

/**
 * A guard that skips quietly is a guard nobody runs.
 *
 * Straight to stderr on purpose: vitest's console interceptor swallows
 * module-scope `console.warn`, and the failure this guards against is a stale
 * database making a comparison pass by comparing nothing.
 */
export function skipBanner(label: string): string {
  return [
    "",
    "!".repeat(72),
    `!! ${label} SKIPPED: no INTEGRATION_DB_URL / DATABASE_URL set.`,
    "!! The guard did not run. A database is required to compare the",
    "!! Drizzle model against anything real.",
    "!".repeat(72),
    "",
  ].join("\n");
}

/**
 * Render a Drizzle column's declared default to a comparable string.
 *
 * Three shapes exist in this model:
 *
 *   - a plain JS value — `.default(false)`, `.default(1)`, `.default("call")`
 *   - an `SQL` object — `.default(sql`now())`, whose `queryChunks` hold the raw
 *     text, so concatenation reproduces it
 *   - a function — `$defaultFn()`, computed per insert and not comparable to a
 *     database expression at all, so it renders as null (declared, not checked)
 *
 * `hasDefault` is deliberately NOT used as the signal. Drizzle sets it true for
 * `primaryKey()` columns that declare no default at all, so it answers a
 * different question than "does this column have a default".
 */
export function renderDrizzleDefault(column: unknown): string | null {
  const c = column as {
    default?: unknown;
    defaultFn?: unknown;
    constructor?: { name?: string };
  };

  // `serial()` and `bigserial()` ARE a sequence default. Drizzle reports them as
  // `hasDefault: true` with `default: undefined` and renders the column type as
  // `serial`, which is what makes Postgres create `<table>_<column>_seq` and
  // attach `nextval(...)` — verified against the database, where `job.id` is
  // `nextval('job_id_seq'::regclass)` and the model is `serial()`.
  //
  // Writing `.default(sql\`nextval('job_id_seq'::regclass)\`)` on top of that
  // would be redundant *and* would hardcode a sequence name Postgres derives
  // itself, so a renamed table or column would diverge silently.
  const ctor = c.constructor?.name;
  if (ctor === "PgSerial" || ctor?.startsWith("PgBigSerial")) return "<serial>";

  const declared = c.default;
  if (declared === undefined || declared === null) return null;

  if (typeof declared === "object" && Array.isArray((declared as { queryChunks?: unknown }).queryChunks)) {
    return (declared as { queryChunks: { value?: unknown }[] }).queryChunks
      .flatMap((chunk) => (Array.isArray(chunk.value) ? chunk.value : [chunk.value]))
      .join("");
  }

  return String(declared);
}

export async function compareModelToDatabase(
  sqlClient: postgres.Sql | null,
): Promise<ModelComparison> {
  if (!sqlClient) {
    return {
      columns: [],
      compared: 0,
      absent: 0,
      skipReason: "no INTEGRATION_DB_URL / DATABASE_URL set",
    };
  }

  // `format_type` renders in Drizzle's own vocabulary — "text",
  // "timestamp with time zone", "integer" — so the types compare as strings.
  // `information_schema.data_type` uses a different vocabulary and would not.
  //
  // Defaults come from `information_schema` because `pg_attribute.adbin` was
  // removed in PostgreSQL 12. Identity columns report a null default there,
  // which is the behaviour the model side mirrors.
  //
  // The information_schema join is LEFT so the compared-column count is exactly
  // the count `pg_attribute` alone produces. An inner join would drop any table
  // the connecting role cannot see, and the type guard's own "not vacuous"
  // assertion would then be measuring the privilege level, not the model.
  const rows = await sqlClient<
    {
      table_name: string;
      column_name: string;
      db_type: string;
      db_default: string | null;
    }[]
  >`
    select c.relname as table_name,
           a.attname as column_name,
           format_type(a.atttypid, a.atttypmod) as db_type,
           i.column_default as db_default
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      left join information_schema.columns i
        on i.table_schema = n.nspname
       and i.table_name = c.relname
       and i.column_name = a.attname
     where n.nspname = 'public'
       and a.attnum > 0
       and not a.attisdropped
       and c.relkind in ('r', 'p')
  `;

  const actual = new Map(rows.map((row) => [`${row.table_name}.${row.column_name}`, row]));

  const columns: ColumnComparison[] = [];
  let absent = 0;

  for (const value of Object.values(schema)) {
    if (!is(value as never, Table)) continue;
    const tableName = (value as unknown as { [k: symbol]: unknown })[
      Symbol.for("drizzle:Name")
    ] as string;

    for (const [columnName, column] of Object.entries(getTableColumns(value as never))) {
      const key = `${tableName}.${columnName}`;
      const row = actual.get(key);
      // Absent from this database: an unapplied migration, not a model lie.
      if (row === undefined) {
        absent += 1;
        continue;
      }
      columns.push({
        key,
        drizzleType: (column as unknown as { getSQLType: () => string }).getSQLType(),
        dbType: row.db_type,
        drizzleDefault: renderDrizzleDefault(column),
        dbDefault: row.db_default,
      });
    }
  }

  return { columns, compared: columns.length, absent, skipReason: null };
}

/**
 * `table.column` for each recorded baseline line.
 *
 * Lines are cut at the first colon, so a drift description may contain colons.
 */
export function recordedKeys(baselinePath: string): string[] {
  if (!existsSync(baselinePath)) return [];
  return readFileSync(baselinePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.slice(0, line.indexOf(":")));
}

export function writeBaseline(baselinePath: string, lines: string[]): void {
  mkdirSync(dirname(baselinePath), { recursive: true });
  writeFileSync(baselinePath, `${lines.map((line) => `${line}\n`).join("")}`);
}

/**
 * Baseline lines whose key no longer drifts.
 *
 * This is what makes a baseline a ratchet rather than a snapshot: correcting a
 * column must not leave a stale entry, because the next regression on that
 * column would match it and pass.
 */
export function staleEntries(baselinePath: string, stillDrifting: Set<string>): string[] {
  return recordedKeys(baselinePath).filter((key) => !stillDrifting.has(key));
}

/** Drift lines whose `table.column` is not already recorded. */
export function freshEntries(lines: string[], baselinePath: string): string[] {
  const recorded = new Set(recordedKeys(baselinePath));
  return lines.filter((line) => !recorded.has(line.slice(0, line.indexOf(":"))));
}

export function driftKeys(lines: string[]): Set<string> {
  return new Set(lines.map((line) => line.slice(0, line.indexOf(":"))));
}