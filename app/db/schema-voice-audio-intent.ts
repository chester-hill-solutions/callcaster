import { jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { VoiceAudioRequestIdentity } from "@/lib/voice-audio-connection";

/** One submitted audio request; cancellation may precede connection admission. */
export const workspace_voice_audio_intent = pgTable("workspace_voice_audio_intent", {
  workspace: uuid().notNull(),
  user_id: text().notNull(),
  intent_id: uuid().notNull(),
  request: jsonb().$type<VoiceAudioRequestIdentity>(),
  connection_id: uuid(),
  cancel_requested_at: timestamp({ withTimezone: true, mode: "date" }),
  created_at: timestamp({ withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (table) => [primaryKey({ name: "voice_audio_intent_control_pk", columns: [table.workspace, table.user_id, table.intent_id] })]);
