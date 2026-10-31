import {
  bigint,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  ContactMergeEffects,
  ContactMergeProfile,
} from "@/lib/contact-merge";

// Historical snapshots must survive later edits or removal of the retained profile.
export const contact_merge_receipt = pgTable(
  "contact_merge_receipt",
  {
    id: uuid().notNull(),
    workspace: uuid().notNull(),
    actor_id: text().notNull(),
    retained_contact_id: bigint({ mode: "number" }).notNull(),
    version: text().notNull(),
    source_profiles: jsonb().$type<ContactMergeProfile[]>().notNull(),
    queue_snapshot: jsonb().$type<Record<string, unknown>[]>().notNull(),
    effects: jsonb().$type<ContactMergeEffects>().notNull(),
    created_at: timestamp({ withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.workspace, table.id] })],
);
