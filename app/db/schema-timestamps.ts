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
 * Two variants, because the schema really does have two:
 *
 *   `isoTimestamps()`        `timestamp with time zone` as a string. This
 *                            replaced `textTimestamps()`, the last variant that
 *                            declared a `text()` column for a database column
 *                            that is `timestamp with time zone` (#2213). Its
 *                            callers already wrote ISO strings, so the mode kept
 *                            every one of them working unchanged.
 *   `timestampTimestamps()`  `timestamp with time zone` as a Date, no timezone.
 *
 * A fourth pair uses `timestamp({ withTimezone: true, mode: "date" })` on a
 * single table; it is left inline rather than given a factory for one caller.
 */
import { sql } from "drizzle-orm";
import { text, timestamp } from "drizzle-orm/pg-core";

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