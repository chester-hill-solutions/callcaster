import { bigint, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

export type VoiceDialerRequest = { to: string; callerId: string; audioConnectionId: string | null; audioGeneration: number | null };

/** Start and Stop share one durable actor-owned request, even before admission. */
export const workspace_voice_dialer_intent = pgTable("workspace_voice_dialer_intent", {
  workspace: uuid().notNull(), user_id: text().notNull(), intent_id: uuid().notNull(), campaign_id: bigint({ mode: "number" }).notNull(),
  request: jsonb().$type<VoiceDialerRequest>(), account_sid: text(), conference_id: text(), reservation_id: uuid(),
  stop_requested_at: timestamp({ withTimezone: true, mode: "date" }), stopped_at: timestamp({ withTimezone: true, mode: "date" }),
  retired_at: timestamp({ withTimezone: true, mode: "date" }),
  lease_token: uuid().notNull().defaultRandom(), lease_expires_at: timestamp({ withTimezone: true, mode: "date" }).notNull().defaultNow(),
  last_error: text(), created_at: timestamp({ withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updated_at: timestamp({ withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, table => [primaryKey({ name: "voice_dialer_intent_pk", columns: [table.workspace, table.user_id, table.intent_id] })]);
