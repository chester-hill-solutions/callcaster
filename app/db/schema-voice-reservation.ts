import { bigint, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const workspace_voice_reservation = pgTable("workspace_voice_reservation", {
  id: uuid().primaryKey(),
  workspace: uuid().notNull(),
  kind: text().$type<"ivr" | "staffed">().notNull(),
  credits: integer().notNull(),
  account_sid: text().notNull(),
  recipient: text().notNull(),
  caller_id: text().notNull(),
  campaign_id: bigint({ mode: "number" }),
  contact_id: bigint({ mode: "number" }),
  outreach_attempt_id: bigint({ mode: "number" }),
  user_id: text(),
  state: text().$type<"reserved" | "creating" | "active" | "settled" | "released">().notNull().default("reserved"),
  provider_sid: text(),
  setup_sid: text(),
  lease_token: uuid().notNull(),
  lease_expires_at: timestamp({ withTimezone: true, mode: "date" }).notNull(),
  send_started_at: timestamp({ withTimezone: true, mode: "date" }),
  last_error: text(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updated_at: timestamp({ withTimezone: true, mode: "date" }).notNull().defaultNow(),
});
