import { bigint, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const predictive_machine_operation = pgTable(
  "predictive_machine_operation",
  {
    id: uuid().primaryKey(),
    workspace: uuid().notNull(),
    call_sid: text().notNull(),
    outreach_attempt_id: bigint({ mode: "number" }).notNull(),
    campaign_id: bigint({ mode: "number" }).notNull(),
    conference_id: text().notNull(),
    user_id: uuid().notNull(),
    audio_file: text(),
    ack_url: text().notNull(),
    state: text()
      .$type<
        | "prepared"
        | "issued"
        | "acknowledged"
        | "dropped"
        | "continuing"
        | "continued"
        | "uncertain"
      >()
      .notNull(),
    lease_token: uuid().notNull(),
    lease_until: timestamp({ withTimezone: true, mode: "date" }).notNull(),
    issued_at: timestamp({ withTimezone: true, mode: "date" }),
    acknowledged_at: timestamp({ withTimezone: true, mode: "date" }),
    send_started_at: timestamp({ withTimezone: true, mode: "date" }),
    successor_queue_id: bigint({ mode: "number" }),
    successor_attempt_id: bigint({ mode: "number" }),
    successor_contact_id: bigint({ mode: "number" }),
    successor_call_sid: text(),
    successor_voice_url: text(),
    successor_status_url: text(),
    successor_callback_sid: text(),
    successor_callback_status: text(),
    last_error: text(),
    created_at: timestamp({ withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp({ withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
);
