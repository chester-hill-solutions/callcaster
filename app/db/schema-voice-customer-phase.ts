import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Immutable authority for one final, non-looping customer Conference instruction. */
export const workspace_voice_customer_phase = pgTable("workspace_voice_customer_phase", {
  id: uuid().primaryKey(),
  workspace: uuid().notNull(),
  reservation_id: uuid().notNull(),
  user_id: text().notNull(),
  capability: text().$type<"phone-conference-v1">().notNull(),
  logical_call_sid: text().notNull(),
  customer_call_sid: text().notNull(),
  account_sid: text().notNull(),
  audio_connection_id: uuid().notNull(),
  audio_generation: integer().notNull(),
  conference_sid: text().notNull(),
  conference_name: text().notNull(),
  callback_url: text().notNull(),
  recording_operation_id: uuid().notNull(),
  participant_label: text().notNull(),
  instruction_digest: text().notNull(),
  issued_at: timestamp({ withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

/** No global Conference sequence uniqueness is assumed for these signed facts. */
export const workspace_voice_customer_phase_event = pgTable("workspace_voice_customer_phase_event", {
  id: uuid().primaryKey(),
  workspace: uuid().notNull(),
  phase_id: uuid().notNull(),
  facts: jsonb().notNull(),
  fingerprint: text().notNull(),
  occurred_at: timestamp({ withTimezone: true, mode: "date" }),
  sequence_number: integer(),
  received_at: timestamp({ withTimezone: true, mode: "date" }).notNull().defaultNow(),
});
