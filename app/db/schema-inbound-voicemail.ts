import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export type VoicemailEmailPayload = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
};

export const inbound_voicemail_recipient = pgTable("inbound_voicemail_recipient", {
  call_sid: text().primaryKey(),
  workspace: uuid().notNull(),
  phone_number: text().notNull(),
  recipient: text().notNull(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const inbound_voicemail_delivery = pgTable("inbound_voicemail_delivery", {
  id: uuid().primaryKey(),
  workspace: uuid().notNull(),
  call_sid: text().notNull(),
  recording_sid: text().notNull(),
  recording_url: text().notNull(),
  phone_number: text().notNull(),
  recipient: text().notNull(),
  signed_url: text().notNull(),
  email_payload: jsonb().$type<VoicemailEmailPayload>().notNull(),
  state: text().$type<"prepared" | "sending" | "sent" | "uncertain">().notNull().default("prepared"),
  first_send_at: timestamp({ withTimezone: true, mode: "date" }),
  lease_token: uuid(),
  lease_until: timestamp({ withTimezone: true, mode: "date" }),
  sent_at: timestamp({ withTimezone: true, mode: "date" }),
  resend_email_id: text(),
  last_error: text(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).notNull().defaultNow(),
});
