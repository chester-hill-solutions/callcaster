/**
 * Timestamp column pairs shared by the `pgTable` definitions.
 *
 * Extracted because the Drizzle model repeats `created_at` / `updated_at` on
 * nearly every workspace-scoped table, and there are three spellings of the pair
 * in the schema. Before #2243 the pair was written out longhand with no
 * `.default()`, so the duplication was invisible to the DRY gate; adding the
 * database's own `now()` default to each copy made the repeated block long
 * enough to trip both dimensions, which is the gate doing its job.
 *
 * **Factories, not shared column objects.** A Drizzle column is bound to the
 * table that owns it, so the same instance cannot appear in two `pgTable`
 * definitions. Each call builds fresh columns — which also means a caller can
 * spread the pair and then override one half.
 *
 * Three variants, because the schema really does have three:
 *
 *   `textTimestamps()`       a `text()` column. Still #2213 drift — every real
 *                            database has `timestamp with time zone` — and kept
 *                            as its own factory so #2213's slicing has one place
 *                            per variant to change rather than every table.
 *   `isoTimestamps()`        `timestamp with time zone` as a string.
 *   `timestampTimestamps()`  `timestamp with time zone` as a Date, no timezone.
 *
 * A fourth pair uses `timestamp({ withTimezone: true, mode: "date" })` on a
 * single table; it is left inline rather than given a factory for one caller.
 */
import { sql } from "drizzle-orm";
import { text, timestamp } from "drizzle-orm/pg-core";

/**
 * `created_at` / `updated_at` as `text()` with a `now()` default.
 *
 * The database supplies `now()` for both, so the model declares it and an insert
 * may omit them (`test/integration-db/schema-default-drift.test.ts`).
 *
 * The type is still `text()`, which no real database agrees with. That is #2213's
 * work, not this file's — see
 * `scripts/baselines/schema-type-drift.txt` for the columns involved.
 */
export function textTimestamps() {
  return {
    created_at: text().notNull().default(sql`now()`),
    updated_at: text().notNull().default(sql`now()`),
  };
}

/** `created_at` / `updated_at` as `timestamp with time zone`, mode `string`. */
export function isoTimestamps() {
  return {
    created_at: timestamp({ withTimezone: true, mode: "string" }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true, mode: "string" }).notNull().defaultNow(),
  };
}

/** `created_at` / `updated_at` as `timestamp without time zone`, mode `date`. */
export function timestampTimestamps() {
  return {
    created_at: timestamp().notNull().defaultNow(),
    updated_at: timestamp().notNull().defaultNow(),
  };
}