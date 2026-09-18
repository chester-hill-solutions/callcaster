/**
 * Campaign tables, split out of schema.ts.
 *
 * schema.ts is capped by scripts/check-app-file-size.mjs, whose allowlist entry
 * says to split this file by domain rather than raise the pin again — and it
 * already re-exports schema-survey.ts / schema-inbound-queue.ts the same way.
 * The campaign tables are self-contained (no `.references()`), so the move is
 * mechanical; relations still live in schema.ts and wire these by import.
 *
 * Import from "@/db/schema" as before; this module is re-exported there.
 */
import {
  pgTable,
  text,
  integer,
  bigint,
  numeric,
  boolean,
  jsonb,
  uuid,
  unique,
} from "drizzle-orm/pg-core";

export const campaign = pgTable("campaign", {
  allow_bulk_local_send: boolean().notNull().default(false),
  body_text: text(),
  caller_id: text(),
  created_at: text().notNull(),
  dial_ratio: numeric({ mode: "number" }).notNull(),
  dial_type: text(),
  disposition_options: jsonb(),
  end_date: text(),
  group_household_queue: boolean().notNull(),
  id: bigint({ mode: "number" }).notNull().generatedByDefaultAsIdentity().primaryKey(),
  is_sample: boolean().notNull().default(false),
  live_questions: jsonb(),
  message_media: text().array(),
  next_queue_order: integer().notNull(),
  schedule: jsonb(),
  script_id: integer(),
  sms_messaging_service_sid: text(),
  sms_send_mode: text(),
  sms_send_window: jsonb(),
  start_date: text(),
  status: text(),
  title: text().notNull(),
  type: text(),
  voicemail_drop_enabled: boolean().notNull().default(false),
  voicemail_file: text(),
  voicedrop_audio: text(),
  workspace: uuid(),
});

export const campaign_audience = pgTable("campaign_audience", {
  audience_id: bigint({ mode: "number" }).notNull(),
  campaign_id: bigint({ mode: "number" }).notNull().generatedByDefaultAsIdentity(),
  created_at: text().notNull(),
});

export const campaign_queue = pgTable(
  "campaign_queue",
  {
    assigned_to_user_id: uuid(),
    attempt_count: integer().notNull(),
    attempts: integer().notNull(),
    campaign_id: bigint({ mode: "number" }).notNull(),
    claimed_at: text(),
    contact_id: bigint({ mode: "number" }).notNull(),
    created_at: text().notNull(),
    id: bigint({ mode: "number" }).notNull().generatedByDefaultAsIdentity().primaryKey(),
    last_attempt_at: text(),
    last_attempt_error: text(),
    provider_status: text(),
    queue_order: integer(),
    queue_state: text(),
    dequeued_by: uuid(),
    dequeued_at: text(),
    dequeued_reason: text(),
    workspace: uuid().notNull(),
  },
  (table) => [unique("campaign_queue_campaign_contact_unique").on(table.campaign_id, table.contact_id)],
);
