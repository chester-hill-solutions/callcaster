/**
 * Inbound-queue tables (queues, members, entries, agent status), split out
 * of schema.ts to keep it under the file-size guard; see schema-survey.ts for
 * the pattern. The `queue_entry_state` enum lives here because only these
 * tables use it. Import from "@/db/schema" as before; everything is
 * re-exported there, and the relations stay in schema.ts.
 */
import { bigint, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";

export const queue_entry_state = pgEnum("queue_entry_state", ["queued","offered","accepted","declined","timed_out","abandoned","completed"]);

// ─── Inbound Queue ──────────────────────────────────────

export const inbound_queue = pgTable("inbound_queue", {
  created_at: text().notNull(),
  description: text(),
  hold_audio: text(),
  id: bigint({ mode: "number" }).notNull().generatedByDefaultAsIdentity().primaryKey(),
  name: text().notNull(),
  updated_at: text().notNull(),
  workspace_id: uuid().notNull(),
});

export const inbound_queue_member = pgTable("inbound_queue_member", {
  created_at: text().notNull(),
  id: bigint({ mode: "number" }).notNull().generatedByDefaultAsIdentity().primaryKey(),
  queue_id: bigint({ mode: "number" }).notNull(),
  user_id: uuid().notNull(),
  workspace_id: uuid().notNull(),
});

export const inbound_queue_entry = pgTable("inbound_queue_entry", {
  abandoned_at: text(),
  accepted_at: text(),
  call_sid: text(),
  caller_number: text(),
  completed_at: text(),
  created_at: text().notNull(),
  id: bigint({ mode: "number" }).notNull().generatedByDefaultAsIdentity().primaryKey(),
  offered_at: text(),
  offered_to_user_id: text(),
  queue_id: bigint({ mode: "number" }).notNull(),
  status: queue_entry_state().notNull(),
  twilio_queue_sid: text(),
  updated_at: text().notNull(),
  workspace_id: uuid().notNull(),
});

export const agent_status = pgTable("agent_status", {
  workspace_id: uuid().notNull(),
  user_id: uuid().notNull(),
  status: text().notNull(),
  status_reason: text(),
  status_started_at: text().notNull(),
  current_queue_entry_id: bigint({ mode: "number" }),
  last_heartbeat_at: text(),
  updated_at: text().notNull(),
});

export const agent_status_event = pgTable("agent_status_event", {
  id: bigint({ mode: "number" }).notNull().generatedByDefaultAsIdentity().primaryKey(),
  workspace_id: uuid().notNull(),
  user_id: uuid().notNull(),
  from_status: text().notNull(),
  to_status: text().notNull(),
  reason: text(),
  created_at: text().notNull(),
});
