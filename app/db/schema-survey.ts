/**
 * Survey tables, split out of schema.ts.
 *
 * schema.ts is capped at 800 lines by scripts/check-app-file-size.mjs, whose
 * allowlist entry says to split this file by domain rather than raise the pin
 * again — and the file already re-exports schema-transcription.ts the same way.
 * Survey is the most self-contained group: nothing outside it references these
 * tables except through the barrel.
 *
 * Import from "@/db/schema" as before; this module is re-exported there.
 */
import { pgTable, text, integer, boolean, uuid, serial, unique, uniqueIndex } from "drizzle-orm/pg-core";

// ─── Survey ──────────────────────────────────────

export const survey = pgTable("survey", {
  id: serial().notNull().primaryKey(),
  survey_id: uuid().notNull(),
  title: text().notNull(),
  workspace: uuid().notNull(),
  is_active: boolean().notNull(),
  created_at: text().notNull(),
  updated_at: text().notNull(),
});

export const survey_page = pgTable("survey_page", {
  id: serial().notNull().primaryKey(),
  survey_id: serial().notNull(),
  page_id: uuid().notNull(),
  title: text().notNull(),
  page_order: integer().notNull(),
  created_at: text().notNull(),
  updated_at: text().notNull(),
});

export const survey_question = pgTable("survey_question", {
  id: serial().notNull().primaryKey(),
  page_id: serial().notNull(),
  question_id: uuid().notNull(),
  question_text: text().notNull(),
  question_type: text().notNull(),
  is_required: boolean().notNull(),
  question_order: integer().notNull(),
  created_at: text().notNull(),
  updated_at: text().notNull(),
});

export const question_option = pgTable("question_option", {
  id: serial().notNull().primaryKey(),
  question_id: serial().notNull(),
  option_value: text().notNull(),
  option_label: text().notNull(),
  option_order: integer().notNull(),
  created_at: text().notNull(),
});

export const survey_response = pgTable(
  "survey_response",
  {
    id: serial().notNull().primaryKey(),
    survey_id: serial().notNull(),
    result_id: text().notNull(),
    contact_id: serial(),
    started_at: text().notNull(),
    completed_at: text(),
    last_page_completed: text(),
    created_at: text().notNull(),
    updated_at: text().notNull(),
  },
  (table) => [uniqueIndex("survey_response_survey_result_unique").on(table.survey_id, table.result_id)],
);

export const response_answer = pgTable("response_answer", {
  id: serial().notNull().primaryKey(),
  response_id: serial().notNull(),
  question_id: serial().notNull(),
  answer_value: text().notNull(),
  answered_at: text().notNull(),
  created_at: text().notNull(),
});
