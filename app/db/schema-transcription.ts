/**
 * Slice 12.1 / ADR-0027–0029 tables.
 * FK target is call.sid until ADR-0015 introduces call.id as domain PK.
 */
import {
  pgTable,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  uuid,
  real,
  index,
} from "drizzle-orm/pg-core";
import type {
  CoachingEventPayload,
  TranscriptMetadata,
} from "@/lib/coaching-schemas";

export const transcript_segment = pgTable(
  "transcript_segment",
  {
    id: uuid().defaultRandom().primaryKey(),
    call_sid: text().notNull(),
    speaker: integer().notNull(),
    speaker_label: text(),
    text: text().notNull(),
    start_ms: bigint({ mode: "number" }).notNull(),
    end_ms: bigint({ mode: "number" }).notNull(),
    confidence: real(),
    filler_count: integer().default(0),
    is_final: boolean().default(true),
    created_at: timestamp({ withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (t) => [index("transcript_segment_call_sid_idx").on(t.call_sid)],
);

export const coaching_event = pgTable(
  "coaching_event",
  {
    id: uuid().defaultRandom().primaryKey(),
    call_sid: text().notNull(),
    type: text().notNull(),
    severity: text(),
    payload: jsonb().$type<CoachingEventPayload>(),
    acknowledged_at: timestamp({ withTimezone: true, mode: "string" }),
    created_at: timestamp({ withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (t) => [index("coaching_event_call_sid_idx").on(t.call_sid)],
);

export const coaching_session = pgTable(
  "coaching_session",
  {
    id: uuid().defaultRandom().primaryKey(),
    call_sid: text().notNull().unique(),
    wpm_avg: integer(),
    filler_count: integer(),
    pause_count: integer(),
    long_pause_count: integer(),
    score: integer(),
    summary: text(),
    created_at: timestamp({ withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
);

export const call_transcript = pgTable("call_transcript", {
  id: uuid().defaultRandom().primaryKey(),
  call_sid: text().notNull().unique(),
  provider: text().notNull(),
  language: text().default("en"),
  full_text: text(),
  word_count: integer(),
  duration_ms: bigint({ mode: "number" }),
  metadata: jsonb().$type<TranscriptMetadata>(),
  created_at: timestamp({ withTimezone: true, mode: "string" }).defaultNow().notNull(),
});
