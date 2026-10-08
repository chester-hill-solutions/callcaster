import { bigint, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { CsvSource } from "@/lib/csv-source";

export type ImportWarning = { code: "unknown-opt-out"; header: string; value: string };
export const audience_import_run = pgTable("audience_import_run", {
  id: uuid().defaultRandom().primaryKey(),
  workspace: uuid().notNull(),
  audience_id: bigint({ mode: "number" }).notNull(),
  identity: text().notNull(),
  file_sha256: text().notNull(),
  mapping: jsonb().$type<{ fields: Array<[string, string]>; split: string | null; voterSource: string | null; version: number }>().notNull(),
  created_by: uuid().notNull(),
  imported_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  source_rows: integer().notNull(),
  next_index: integer().default(0).notNull(),
  imported: integer().default(0).notNull(),
  invalid: integer().default(0).notNull(),
  duplicates: integer().default(0).notNull(),
  state: text().$type<"processing" | "completed">().default("processing").notNull(),
}, table => [uniqueIndex("audience_import_identity").on(table.workspace, table.audience_id, table.identity)]);

export const audience_import_row = pgTable("audience_import_row", {
  run_id: uuid().notNull(),
  workspace: uuid().notNull(),
  record_number: integer().notNull(),
  source: jsonb().$type<CsvSource>().notNull(),
  outcome: text().$type<"imported" | "invalid" | "duplicate">().notNull(),
  reason: text(),
  // Receipts survive removal of a contact or household; they are not live joins.
  contact_id: bigint({ mode: "number" }),
  household_id: uuid(),
  warnings: jsonb().$type<ImportWarning[]>().default([]).notNull(),
}, table => [primaryKey({ columns: [table.run_id, table.record_number] })]);
