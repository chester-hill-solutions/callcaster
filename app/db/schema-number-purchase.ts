import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const workspace_number_purchase = pgTable("workspace_number_purchase", {
  id: uuid().primaryKey(),
  workspace: uuid().notNull(),
  actor_user_id: text().notNull(),
  phone_number: text().notNull(),
  account_sid: text().notNull(),
  credits: integer().notNull(),
  state: text().$type<"reserved" | "creating" | "provisioned" | "completed" | "cancelled">().notNull().default("reserved"),
  provider_sid: text(),
  last_error: text(),
  lease_token: uuid().notNull(),
  lease_expires_at: timestamp({ withTimezone: true, mode: "date" }).notNull(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updated_at: timestamp({ withTimezone: true, mode: "date" }).notNull().defaultNow(),
});
