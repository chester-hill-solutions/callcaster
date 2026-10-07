// DANGER: this file is hand-synced introspection output, not the source of
// truth for the database schema. It has zero `.references()` declared and
// there is no drizzle/meta journal checked in, so running
// `drizzle-kit generate` against this schema (see drizzle.config.ts) can
// emit DESTRUCTIVE DDL (dropped/recreated constraints, tables, etc.).
//
// Do NOT run `drizzle-kit generate` against this file to produce real
// migrations. New DDL goes in hand-written SQL under
// client/migrations/*.sql — see docs/migration-delivery-board.md item 1.14
// (schema.ts is hand-synced from baseline because drizzle-kit introspect
// currently errors against this Postgres version).
//
// Hand-maintained Drizzle schema — update when client/migrations/*.sql changes

import {
  pgTable, text, integer, bigint, numeric, boolean, timestamp, jsonb, uuid, serial, bigserial, smallint, pgEnum,
  uniqueIndex, unique,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
export { workspace_number_release } from "./schema-number-release";
export { predictive_machine_operation } from "./schema-predictive-machine";
export { inbound_voicemail_recipient, inbound_voicemail_delivery } from "./schema-inbound-voicemail";
import type { CoachingConfig } from "@/lib/coaching-schemas";
import { isoTimestamps, textTimestamps, timestampTimestamps } from "./schema-timestamps";
// Type-only import; the cycle with db-types (which type-imports this module)
// is erased at compile time and carries no runtime modules.
import type { Json } from "@/lib/db-types";

export {
  transcript_segment,
  coaching_event,
  coaching_session,
  call_transcript,
} from "./schema-transcription";

// Inbound-queue tables and their enum live in schema-inbound-queue.ts; the
// relations block below still wires them, so import as well as re-export.
import {
  queue_entry_state,
  inbound_queue,
  inbound_queue_member,
  inbound_queue_entry,
  agent_status,
  agent_status_event
} from "./schema-inbound-queue";
export {
  queue_entry_state,
  inbound_queue,
  inbound_queue_member,
  inbound_queue_entry,
  agent_status,
  agent_status_event
};

// Re-exported so `@/db/schema` stays the single import site; also imported
// because the relations block below wires these to campaign/contact.
import {
  survey,
  survey_page,
  survey_question,
  question_option,
  survey_response,
  response_answer,
} from "./schema-survey";
export {
  survey,
  survey_page,
  survey_question,
  question_option,
  survey_response,
  response_answer,
};

// Campaign tables live in schema-campaign.ts; re-exported here so
// `@/db/schema` stays the single import site. Imported (not just re-exported)
// because the relations block below wires them.
import {
  campaign,
  campaign_audience,
  campaign_queue,
} from "./schema-campaign";
export { campaign, campaign_audience, campaign_queue };

export const agent_state = pgEnum("agent_state", ["offline","available","busy","wrap_up","away"]);
export const answered_by = pgEnum("answered_by", ["human","machine","unknown"]);
export const call_status = pgEnum("call_status", ["queued","ringing","in-progress","canceled","completed","failed","busy","no-answer","initiated"]);
export const campaign_status = pgEnum("campaign_status", ["pending","scheduled","running","complete","paused","draft","archived","waiting"]);
export const campaign_type = pgEnum("campaign_type", ["message","robocall","simple_ivr","complex_ivr","live_call","email"]);
export const dial_types = pgEnum("dial_types", ["call","predictive"]);
export const message_direction = pgEnum("message_direction", ["inbound","outbound-api","outbound-call","outbound-reply"]);
export const message_status = pgEnum("message_status", ["accepted","scheduled","canceled","queued","sending","sent","failed","delivered","undelivered","receiving","received","read"]);
export const queue_status = pgEnum("queue_status", ["queued","dequeued"]);
export const voter_list_source = pgEnum("voter_list_source", ["liberalist","van","elections_canada","elections_ontario","manual","other"]);
/** Legacy enum renamed in 0008_chs_workspace_membership (CHS table claims workspace_role). */
export const workspace_role = pgEnum("workspace_users_role", ["owner","member","caller","admin"]);

// ─── Workspace ──────────────────────────────────────

export const workspace = pgTable("workspace", {
  created_at: text().notNull().default(sql`now()`),
  credits: integer().notNull(),
  disabled: boolean().notNull().default(false),
  feature_flags: jsonb().notNull().default({
                                              ivr: {
                                                campaign: true,
                                              },
                                              sms: {
                                                chat: true,
                                                campaign: true,
                                              },
                                              call: {
                                                dial: true,
                                                campaign: true,
                                              },
                                              webhooks: {
                                                campaign: true,
                                                workspace: true,
                                              },
                                            }),
  /** Live coaching config (ADR-0028 / Slice 12.1). */
  coaching_config: jsonb().$type<CoachingConfig>().default({
                                                              wpmMax: 160,
                                                              wpmMin: 120,
                                                              llmPersona: "encouraging sales coach",
                                                              fillerWords: ["uh", "um", "like", "you know", "basically", "actually"],
                                                              llmCadenceMs: 30000,
                                                              pauseThresholdMs: 1500,
                                                              disclosureEnabled: false,
                                                            }),
  id: uuid().notNull().primaryKey().default(sql`gen_random_uuid()`),
  key: text(),
  name: text().notNull(),
  owner: text(),
  stripe_id: text(),
  stripe_customer_creation: jsonb().$type<{
    name: string;
    email: string;
    metadata: { callcaster_workspace_id: string; callcaster_request_id: string };
  }>(),
  stripe_customer_creation_started_at: timestamp({ withTimezone: true, mode: "string" }),
  stripe_customer_conflict: jsonb().$type<{ unclaimed_id: string; canonical_id: string }>(),
  stripe_customer_creation_completed_id: text(),
  token: text(),
  twilio_data: text().notNull(),
  users: text().array(),
});

export const workspace_users = pgTable("workspace_users", {
  created_at: text().notNull().default(sql`now()`),
  id: bigint({ mode: "number" }).notNull().generatedByDefaultAsIdentity().primaryKey(),
  last_accessed: text().default(sql`now()`),
  role: text().notNull().default("caller"),
  user_id: uuid().notNull(),
  workspace_id: uuid().notNull(),
});

/** CHS canonical membership (Wave 1 Phase C — app reads/writes this table). */
export const workspace_member = pgTable(
  "workspace_member",
  {
    id: text().notNull().primaryKey(),
    workspace_id: uuid().notNull().references(() => workspace.id, { onDelete: "cascade" }),
    user_id: text().notNull(),
    role_id: text().notNull(),
    invited_by: text(),
    created_at: timestamp().notNull().defaultNow(),
  },
  (table) => [uniqueIndex("workspace_member_workspace_user_idx").on(table.workspace_id, table.user_id)],
);

/** CHS role templates; global when workspace_id is null. */
export const workspace_role_row = pgTable(
  "workspace_role",
  {
    id: text().notNull().primaryKey(),
    name: text().notNull(),
    workspace_id: text(),
    rank: integer().notNull().default(0),
    created_at: timestamp().notNull().defaultNow(),
  },
  (table) => [uniqueIndex("workspace_role_workspace_name_idx").on(table.workspace_id, table.name)],
);

export const workspace_feature = pgTable(
  "workspace_feature",
  {
    id: text().notNull().primaryKey(),
    name: text().notNull(),
    description: text(),
    workspace_id: text(),
    created_at: timestamp().notNull().defaultNow(),
  },
  (table) => [uniqueIndex("workspace_feature_workspace_name_idx").on(table.workspace_id, table.name)],
);

export const workspace_feature_permission = pgTable(
  "workspace_feature_permission",
  {
    id: text().notNull().primaryKey(),
    workspace_id: text(),
    role_id: text().notNull(),
    feature_id: text().notNull(),
    allowed: boolean().notNull().default(false),
    created_at: timestamp().notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("workspace_feature_permission_scope_idx").on(
      table.workspace_id,
      table.role_id,
      table.feature_id,
    ),
  ],
);

/** CHS email-first invitation (SEC-03 attach after DDL). */
export const workspace_invitation = pgTable("workspace_invitation", {
  id: text().notNull().primaryKey(),
  workspace_id: text().notNull(),
  email: text().notNull(),
  role_id: text().notNull(),
  invited_by_user_id: text().notNull(),
  token_hash: text().notNull(),
  status: text().notNull().default("pending"),
  expires_at: timestamp().notNull(),
  accepted_at: timestamp(),
  accepted_by_user_id: text(),
  ...timestampTimestamps(),
});

export const workspace_api_key = pgTable(
  "workspace_api_key",
  {
    id: text().notNull().primaryKey().default(sql`gen_random_uuid()`),
    workspace_id: uuid().notNull(),
    name: text().notNull(),
    key_prefix: text().notNull(),
    key_hash: text().notNull(),
    created_by: uuid(),
    created_at: text().notNull().default(sql`now()`),
    last_used_at: text(),
    /** ProductCapabilityId allowlist; empty = deny-all for capability-gated routes. */
    scopes: text().array().notNull().default([]),
    /** ISO-8601 expiry; null only for pre-SEC-07 legacy keys. */
    expires_at: text(),
  },
  (table) => [uniqueIndex("workspace_api_key_key_prefix_unique").on(table.key_prefix)],
);

export const workspace_invite = pgTable("workspace_invite", {
  created_at: text().notNull().default(sql`now()`),
  id: text().notNull().primaryKey().default(sql`gen_random_uuid()`),
  isNew: boolean().notNull().default(true),
  role: text().notNull().default("member"),
  user_id: uuid().notNull(),
  workspace: uuid().notNull(),
});

export const workspace_number = pgTable("workspace_number", {
  capabilities: jsonb(),
  created_at: text().notNull().default(sql`now()`),
  friendly_name: text(),
  handset_enabled: boolean().notNull().default(false),
  id: bigint({ mode: "number" }).notNull().generatedByDefaultAsIdentity().primaryKey(),
  inbound_action: text(),
  inbound_audio: text(),
  inbound_queue_id: bigint({ mode: "number" }),
  inbound_ring_count: integer().notNull().default(4),
  inbound_script_id: bigint({ mode: "number" }),
  phone_number: text(),
  /** Unpaid cycle count at which the customer was last warned; null = never. */
  rental_warned_cycle: integer(),
  /** Unpaid-rental suspension: blocks outbound use, inbound still works. */
  suspended_at: timestamp({ withTimezone: true, mode: "string" }),
  twilio_phone_number_sid: text(),
  type: text().notNull(),
  workspace: uuid().notNull(),
});

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

// ─── Script ───────────────────────────────────────

export const script = pgTable(
  "script",
  {
    created_at: text().notNull().default(sql`now()`),
    created_by: uuid(),
    id: bigint({ mode: "number" }).notNull().generatedByDefaultAsIdentity().primaryKey(),
    is_sample: boolean().notNull().default(false),
    name: text().notNull().default(""),
    steps: jsonb(),
    type: text(),
    updated_at: text(),
    updated_by: text(),
    workspace: uuid(),
  },
  (table) => [uniqueIndex("script_workspace_name_unique").on(table.workspace, table.name)],
);

// ─── Contact/Audience ──────────────────────────────────────

export const contact = pgTable("contact", {
  address: text(),
  city: text(),
  country: text(),
  created_at: text().notNull().default(sql`now()`),
  created_by: uuid(),
  date_updated: text(),
  email: text(),
  external_id: text(),
  firstname: text(),
  household_id: uuid(),
  id: bigint({ mode: "number" }).notNull().generatedByDefaultAsIdentity().primaryKey(),
  // Twilio Lookup v2 line-type cache: null = never looked up; set lazily on the first SMS attempt, then permanent.
  line_type: text(),
  line_type_checked_at: timestamp({ withTimezone: true, mode: "string" }),
  opt_out: boolean().default(false),
  other_data: jsonb().$type<Json[]>().notNull().default([]),
  phone: text(),
  postal: text(),
  province: text(),
  support_level: smallint(),
  surname: text(),
  voter_id: text(),
  voter_list_expires_at: text(),
  voter_list_imported_at: text(),
  voter_list_source: text(),
  workspace: uuid(),
});

export const contact_audience = pgTable("contact_audience", {
  audience_id: bigint({ mode: "number" }).notNull(),
  contact_id: bigint({ mode: "number" }).notNull().generatedByDefaultAsIdentity(),
  created_at: text().notNull().default(sql`now()`),
});

export const audience = pgTable("audience", {
  created_at: text().notNull().default(sql`now()`),
  id: bigint({ mode: "number" }).notNull().generatedByDefaultAsIdentity().primaryKey(),
  is_conditional: boolean().notNull().default(false),
  name: text(),
  workspace: uuid(),
  status: text().default("pending"),
  total_contacts: numeric({ mode: "number" }),
  processed_contacts: numeric({ mode: "number" }),
  processed_at: text(),
  error_message: text(),
});

export const audience_upload = pgTable("audience_upload", {
  id: bigint({ mode: "number" }).notNull().generatedByDefaultAsIdentity().primaryKey(),
  audience_id: bigint({ mode: "number" }).notNull(),
  workspace: uuid().notNull(),
  created_by: uuid(),
  created_at: text().notNull().default(sql`now()`),
  status: text().notNull(),
  file_name: text(),
  file_size: bigint({ mode: "number" }),
  total_contacts: bigint({ mode: "number" }).notNull(),
  processed_contacts: bigint({ mode: "number" }).notNull(),
  processed_at: text(),
  error_message: text(),
  header_mapping: jsonb().default({}),
  split_name_column: text(),
});

export const households = pgTable("households", {
  // DB column is `uuid DEFAULT gen_random_uuid()` (drizzle/0000_baseline.sql);
  // modeling it as text() made inserts demand an id the DB generates itself.
  id: uuid().defaultRandom().notNull().primaryKey(),
  household_key: text().notNull(),
  workspace_id: uuid(),
  address: text(),
  city: text(),
  province: text(),
  postal: text(),
  do_not_knock: boolean().notNull().default(false),
  last_contacted_at: text(),
  ...textTimestamps(),
});

// ─── Telephony ──────────────────────────────────────

export const call = pgTable("call", {
  account_sid: text(),
  answered_by: text(),
  answers: jsonb().default({}),
  api_version: text(),
  call_duration: integer(),
  caller_name: text(),
  campaign_id: bigint({ mode: "number" }),
  conference_id: text(),
  contact_id: bigint({ mode: "number" }),
  date_created: timestamp({ withTimezone: true, mode: "date" }).notNull().defaultNow(),
  date_updated: timestamp({ withTimezone: true, mode: "date" }),
  direction: text(),
  duration: text(),
  end_time: timestamp({ withTimezone: true, mode: "date" }),
  forwarded_from: text(),
  from: text(),
  group_sid: text(),
  is_last: boolean().notNull().default(false),
  outreach_attempt_id: bigint({ mode: "number" }),
  parent_call_sid: text(),
  phone_number_sid: text(),
  price: text(),
  queue_id: bigint({ mode: "number" }),
  recording_duration: text(),
  recording_sid: text(),
  recording_url: text(),
  /** Railway Buckets path for our copy of the recording (Slice 12.1 / ADR-0027). */
  audio_url: text(),
  /** Golden transcript pointer (call_transcript.id). */
  transcript_id: uuid(),
  /** Post-call coaching session pointer (coaching_session.id). */
  coaching_session_id: uuid(),
  sid: text().notNull(),
  start_time: timestamp({ withTimezone: true, mode: "date" }),
  status: text(),
  to: text(),
  uri: text(),
  user_id: uuid(),
  workspace: uuid(),
});

export const message = pgTable("message", {
  account_sid: text(),
  api_version: text(),
  body: text(),
  campaign_id: bigint({ mode: "number" }),
  contact_id: bigint({ mode: "number" }),
  date_created: timestamp({ withTimezone: true, mode: "date" }).defaultNow(),
  date_sent: timestamp({ withTimezone: true, mode: "date" }),
  date_updated: timestamp({ withTimezone: true, mode: "date" }),
  direction: text(),
  error_code: integer(),
  error_message: text(),
  from: text(),
  inbound_media: text().array(),
  messaging_service_sid: text(),
  num_media: text(),
  num_segments: text(),
  outbound_media: text().array(),
  /** Requested "send later" time for scheduled sends (Twilio doesn't echo `sendAt` back). */
  scheduled_at: timestamp({ withTimezone: true, mode: "date" }),
  outreach_attempt_id: bigint({ mode: "number" }),
  price: text(),
  price_unit: text(),
  sid: text().notNull(),
  status: text(),
  subresource_uris: jsonb(),
  to: text(),
  uri: text(),
  workspace: uuid().notNull(),
  client_ref: text(),
});

export const outreach_attempt = pgTable("outreach_attempt", {
  answered_at: text(),
  campaign_id: bigint({ mode: "number" }).notNull(),
  callback_audit: boolean(),
  contact_id: bigint({ mode: "number" }).notNull(),
  created_at: text().notNull().default(sql`now()`),
  current_step: text(),
  disposition: text(),
  ended_at: text(),
  id: bigint({ mode: "number" }).notNull().generatedByDefaultAsIdentity().primaryKey(),
  issue_tags: text().array(),
  lawn_sign: boolean(),
  membership_sold: boolean(),
  result: jsonb().notNull().default({}),
  support_level: smallint(),
  user_id: uuid(),
  volunteer_interest: text(),
  vote_by_mail: boolean(),
  workspace: uuid().notNull().references(() => workspace.id, { onDelete: "cascade" }),
});

export const workspace_events = pgTable("workspace_events", {
  id: serial().notNull().primaryKey(),
  workspace_id: uuid().notNull().references(() => workspace.id, { onDelete: "cascade" }),
  event_type: text().notNull(),
  payload: jsonb().notNull(),
  created_at: text().notNull().default(sql`now()`),
});

export const workspace_audit_event = pgTable("workspace_audit_event", {
  id: bigserial({ mode: "number" }).notNull().primaryKey(),
  workspace_id: uuid().notNull().references(() => workspace.id, { onDelete: "cascade" }),
  created_at: text().notNull().default(sql`now()`),
  actor_type: text().notNull(),
  actor_id: text(),
  api_key_id: bigint({ mode: "number" }),
  action: text().notNull(),
  target_type: text(),
  target_id: text(),
  outcome: text().notNull(),
  request_id: text(),
  metadata: jsonb().notNull().default({}),
});

// Annotates objects in the workspaceAudio bucket. `file_name` (extension
// included) is the join key because every existing consumer stores a bare
// filename; a missing row means "unknown metadata", never a broken reference.
// See client/migrations/20260715120000_workspace_audio_metadata.sql.
export const workspace_audio = pgTable("workspace_audio", {
  id: bigserial({ mode: "number" }).notNull().primaryKey(),
  workspace_id: uuid().notNull().references(() => workspace.id, { onDelete: "cascade" }),
  file_name: text().notNull(),
  origin: text().notNull().default("upload"),
  duration_ms: integer(),
  size_bytes: bigint({ mode: "number" }),
  content_type: text(),
  source_file_name: text(),
  clip_start_ms: integer(),
  clip_end_ms: integer(),
  created_by: text(),
  ...isoTimestamps(),
});

export const rate_limit_bucket = pgTable("rate_limit_bucket", {
  key: text().notNull().primaryKey(),
  count: integer().notNull(),
  reset_at: timestamp({ withTimezone: true, mode: "string" }).notNull(),
});

export const idempotency_record = pgTable("idempotency_record", {
  scope: text().notNull(),
  key: text().notNull(),
  status: integer().notNull(),
  body: text().notNull(),
  headers: jsonb().notNull().default({}),
  created_at: timestamp({ withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const handset_session = pgTable("handset_session", {
  id: text().notNull().primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid().notNull(),
  workspace_id: uuid().notNull(),
  client_identity: text().notNull(),
  status: text().notNull().default("active"),
  created_at: text().notNull().default(sql`now()`),
  expires_at: text().notNull(),
});

// ─── Billing ──────────────────────────────────────

export const transaction_history = pgTable("transaction_history", {
  amount: integer().notNull(),
  created_at: text().notNull().default(sql`now()`),
  id: bigint({ mode: "number" }).notNull().generatedByDefaultAsIdentity().primaryKey(),
  idempotency_key: text(),
  note: text(),
  type: text().notNull(),
  workspace: uuid().notNull(),
  campaign_id: bigint({ mode: "number" }),
  call_sid: text(),
  message_sid: text(),
});

// ─── Auth/Verification ──────────────────────────────────────

export const verification_session = pgTable("verification_session", {
  id: text().notNull().primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid().notNull(),
  expected_caller: text().notNull(),
  status: text().notNull().default("pending"),
  expires_at: text().notNull(),
  created_at: text().notNull().default(sql`now()`),
});

export const user = pgTable("user", {
  access_level: text().default("standard"),
  created_at: text().notNull().default(sql`now()`),
  first_name: text(),
  id: text().notNull().primaryKey(),
  last_name: text(),
  username: text().notNull(),
  verified_audio_numbers: text().array().default([]),
});

export const webhook = pgTable("webhook", {
  created_at: text().notNull().default(sql`now()`),
  custom_headers: jsonb().notNull().default({}),
  destination_url: text().notNull(),
  events: jsonb().default({}),
  id: bigint({ mode: "number" }).notNull().generatedByDefaultAsIdentity().primaryKey(),
  type: text().default("outreach_attempt"),
  updated_at: text(),
  updated_by: text(),
  workspace: uuid().notNull(),
});

// ─── Background jobs (ADR-0007) ──────────────────────────────────────

export const job = pgTable("job", {
  id: serial().notNull().primaryKey(),
  type: text().notNull(),
  status: text().notNull().default("queued"),
  params: jsonb().notNull().default({}),
  workspace_id: uuid(),
  user_id: uuid(),
  idempotency_key: text(),
  error: text(),
  error_message: text(),
  result: jsonb(),
  claimed_by: text(),
  claimed_until: timestamp({ withTimezone: true, mode: "string" }),
  attempt_count: integer().default(0),
  max_attempts: integer().default(3),
  retry_at: timestamp({ withTimezone: true, mode: "string" }),
  progress: integer(),
  started_at: timestamp({ withTimezone: true, mode: "string" }),
  completed_at: timestamp({ withTimezone: true, mode: "string" }),
  failed_at: timestamp({ withTimezone: true, mode: "string" }),
  dead_letter_reason: text(),
  ...isoTimestamps(),
});

// ─── Relations ──────────────────────────────────────

export const workspace_usersRelations = relations(workspace_users, ({ one }) => ({
  workspace: one(workspace, { fields: [workspace_users.workspace_id], references: [workspace.id] }),
}));

export const workspace_api_keyRelations = relations(workspace_api_key, ({ one }) => ({
  workspace: one(workspace, { fields: [workspace_api_key.workspace_id], references: [workspace.id] }),
}));

export const workspace_inviteRelations = relations(workspace_invite, ({ one }) => ({
  workspace: one(workspace, { fields: [workspace_invite.workspace], references: [workspace.id] }),
}));

export const workspace_numberRelations = relations(workspace_number, ({ one }) => ({
  workspace: one(workspace, { fields: [workspace_number.workspace], references: [workspace.id] }),
}));

export const campaignRelations = relations(campaign, ({ one }) => ({
  workspace: one(workspace, { fields: [campaign.workspace], references: [workspace.id] }),
}));

export const contactRelations = relations(contact, ({ one }) => ({
  workspace: one(workspace, { fields: [contact.workspace], references: [workspace.id] }),
}));

export const audienceRelations = relations(audience, ({ one }) => ({
  workspace: one(workspace, { fields: [audience.workspace], references: [workspace.id] }),
}));

export const householdsRelations = relations(households, ({ one }) => ({
  workspace: one(workspace, { fields: [households.workspace_id], references: [workspace.id] }),
}));

export const campaign_queueRelations = relations(campaign_queue, ({ one }) => ({
  campaign: one(campaign, { fields: [campaign_queue.campaign_id], references: [campaign.id] }),
  workspace: one(workspace, { fields: [campaign_queue.workspace], references: [workspace.id] }),
}));

export const campaign_audienceRelations = relations(campaign_audience, ({ one }) => ({
  campaign: one(campaign, { fields: [campaign_audience.campaign_id], references: [campaign.id] }),
}));

export const contact_audienceRelations = relations(contact_audience, ({ one }) => ({
  contact: one(contact, { fields: [contact_audience.contact_id], references: [contact.id] }),
}));

export const outreach_attemptRelations = relations(outreach_attempt, ({ one }) => ({
  contact: one(contact, { fields: [outreach_attempt.contact_id], references: [contact.id] }),
}));

export const audience_uploadRelations = relations(audience_upload, ({ one }) => ({
  audience: one(audience, { fields: [audience_upload.audience_id], references: [audience.id] }),
}));

export const survey_pageRelations = relations(survey_page, ({ one }) => ({
  survey: one(survey, { fields: [survey_page.survey_id], references: [survey.id] }),
}));

export const survey_questionRelations = relations(survey_question, ({ one }) => ({
  survey_page: one(survey_page, { fields: [survey_question.page_id], references: [survey_page.id] }),
}));

export const question_optionRelations = relations(question_option, ({ one }) => ({
  survey_question: one(survey_question, { fields: [question_option.question_id], references: [survey_question.id] }),
}));

export const response_answerRelations = relations(response_answer, ({ one }) => ({
  survey_response: one(survey_response, { fields: [response_answer.response_id], references: [survey_response.id] }),
}));

export const inbound_queue_memberRelations = relations(inbound_queue_member, ({ one }) => ({
  inbound_queue: one(inbound_queue, { fields: [inbound_queue_member.queue_id], references: [inbound_queue.id] }),
}));

export const inbound_queue_entryRelations = relations(inbound_queue_entry, ({ one }) => ({
  inbound_queue: one(inbound_queue, { fields: [inbound_queue_entry.queue_id], references: [inbound_queue.id] }),
}));

export const agent_statusRelations = relations(agent_status, ({ one }) => ({
  workspace: one(workspace, { fields: [agent_status.workspace_id], references: [workspace.id] }),
}));
