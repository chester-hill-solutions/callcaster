import {
  bigint,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const workspace_number_release = pgTable("workspace_number_release", {
  id: uuid().primaryKey(),
  workspace: uuid().notNull(),
  number_id: bigint({ mode: "number" }).notNull(),
  number_created_at: text().notNull(),
  number_type: text().notNull(),
  phone_number: text().notNull(),
  friendly_name: text(),
  provider_sid: text(),
  account_sid: text().notNull(),
  incoming_sids: jsonb().$type<string[]>(),
  outgoing_sids: jsonb().$type<string[]>(),
  messaging_service_sids: jsonb().$type<string[]>().notNull().default([]),
  state: text()
    .$type<"prepared" | "releasing" | "released" | "completed">()
    .notNull()
    .default("prepared"),
  last_error: text(),
  lease_token: uuid().notNull(),
  lease_expires_at: timestamp({ withTimezone: true, mode: "date" }).notNull(),
  created_at: timestamp({ withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  updated_at: timestamp({ withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});
