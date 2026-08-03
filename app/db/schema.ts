// ─────────────────────────────────────────────────────────────────────────
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
// ─────────────────────────────────────────────────────────────────────────

import {
  pgTable, text, integer, bigint, numeric, boolean, timestamp, jsonb, uuid, serial, bigserial, smallint, pgEnum,
  uniqueIndex, unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import type { CoachingConfig } from "@/lib/coaching-schemas";
// Type-only import; the cycle with db-types (which type-imports this module)
// is erased at compile time and carries no runtime modules.
import type { Json } from "@/lib/db-types";

export {
  transcript_segment,
  coaching_event,
  coaching_session,
  call_transcript,
} from "./schema-transcription";

export const agent_state = pgEnum("agent_state", ["offline","available","busy","wrap_up","away"]);
export const answered_by = pgEnum("answered_by", ["human","machine","unknown"]);
export const call_status = pgEnum("call_status", ["queued","ringing","in-progress","canceled","completed","failed","busy","no-answer","initiated"]);
export const campaign_status = pgEnum("campaign_status", ["pending","scheduled","running","complete","paused","draft","archived"]);
export const campaign_type = pgEnum("campaign_type", ["message","robocall","simple_ivr","complex_ivr","live_call","email"]);
export const dial_types = pgEnum("dial_types", ["call","predictive"]);
export const message_direction = pgEnum("message_direction", ["inbound","outbound-api","outbound-call","outbound-reply"]);
export const message_status = pgEnum("message_status", ["accepted","scheduled","canceled","queued","sending","sent","failed","delivered","undelivered","receiving","received","read"]);
export const queue_entry_state = pgEnum("queue_entry_state", ["queued","offered","accepted","declined","timed_out","abandoned","completed"]);
export const queue_status = pgEnum("queue_status", ["queued","dequeued"]);
export const voter_list_source = pgEnum("voter_list_source", ["liberalist","van","elections_canada","elections_ontario","manual","other"]);
/** Legacy enum renamed in 0008_chs_workspace_membership (CHS table claims workspace_role). */
export const workspace_role = pgEnum("workspace_users_role", ["owner","member","caller","admin"]);

// ─── Workspace ──────────────────────────────────────

export const workspace = pgTable("workspace", {
  created_at: text().notNull(),
  credits: integer().notNull(),
  disabled: boolean().notNull(),
  feature_flags: jsonb().notNull(),
  /** Live coaching config (ADR-0028 / Slice 12.1). */
  coaching_config: jsonb().$type<CoachingConfig>(),
  id: text().notNull().primaryKey(),
  key: text(),
  name: text().notNull(),
  owner: text(),
  stripe_id: text(),
  token: text(),
  twilio_data: text().notNull(),
  users: text().array(),
});

export const workspace_users = pgTable("workspace_users", {
  created_at: text().notNull(),
  id: serial().notNull().primaryKey(),
  last_accessed: text(),
  role: text().notNull(),
  user_id: uuid().notNull(),
  workspace_id: uuid().notNull(),
});

/** CHS canonical membership (Wave 1 Phase C — app reads/writes this table). */
export const workspace_member = pgTable(
  "workspace_member",
  {
    id: text().notNull().primaryKey(),
    workspace_id: text().notNull(),
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
  created_at: timestamp().notNull().defaultNow(),
  updated_at: timestamp().notNull().defaultNow(),
});

export const workspace_api_key = pgTable(
  "workspace_api_key",
  {
    id: text().notNull().primaryKey(),
    workspace_id: uuid().notNull(),
    name: text().notNull(),
    key_prefix: text().notNull(),
    key_hash: text().notNull(),
    created_by: uuid(),
    created_at: text().notNull(),
    last_used_at: text(),
    /** ProductCapabilityId allowlist; empty = deny-all for capability-gated routes. */
    scopes: text().array().notNull().default([]),
    /** ISO-8601 expiry; null only for pre-SEC-07 legacy keys. */
    expires_at: text(),
  },
  (table) => [uniqueIndex("workspace_api_key_key_prefix_unique").on(table.key_prefix)],
);

export const workspace_invite = pgTable("workspace_invite", {
  created_at: text().notNull(),
  id: text().notNull().primaryKey(),
  isNew: boolean().notNull(),
  role: text().notNull(),
  user_id: uuid().notNull(),
  workspace: uuid().notNull(),
});

export const workspace_number = pgTable("workspace_number", {
  capabilities: jsonb(),
  created_at: text().notNull(),
  friendly_name: text(),
  handset_enabled: boolean().notNull(),
  id: serial().notNull().primaryKey(),
  inbound_action: text(),
  inbound_audio: text(),
  inbound_queue_id: serial(),
  inbound_ring_count: integer().notNull(),
  inbound_script_id: serial(),
  phone_number: text(),
  /** Unpaid-rental suspension: blocks outbound use, inbound still works. */
  suspended_at: timestamp({ withTimezone: true, mode: "string" }),
  twilio_phone_number_sid: text(),
  type: text().notNull(),
  workspace: uuid().notNull(),
});

// ─── Campaign ──────────────────────────────────────

export const campaign = pgTable("campaign", {
  body_text: text(),
  caller_id: text(),
  created_at: text().notNull(),
  dial_ratio: numeric({ mode: "number" }).notNull(),
  dial_type: text(),
  disposition_options: jsonb(),
  end_date: text(),
  group_household_queue: boolean().notNull(),
  id: serial().notNull().primaryKey(),
  is_active: boolean().notNull(),
  live_questions: jsonb(),
  message_media: text().array(),
  next_queue_order: integer().notNull(),
  schedule: jsonb(),
  script_id: integer(),
  sms_messaging_service_sid: text(),
  sms_send_mode: text(),
  sms_send_window: jsonb(),
  start_date: text(),
  status: text(),
  title: text().notNull(),
  type: text(),
  voicemail_file: text(),
  voicedrop_audio: text(),
  workspace: uuid(),
});

export const campaign_audience = pgTable("campaign_audience", {
  audience_id: serial().notNull(),
  campaign_id: serial().notNull(),
  created_at: text().notNull(),
});

export const campaign_queue = pgTable(
  "campaign_queue",
  {
    assigned_to_user_id: uuid(),
    attempt_count: integer().notNull(),
    attempts: integer().notNull(),
    campaign_id: serial().notNull(),
    claimed_at: text(),
    contact_id: serial().notNull(),
    created_at: text().notNull(),
    id: serial().notNull().primaryKey(),
    last_attempt_at: text(),
    last_attempt_error: text(),
    provider_status: text(),
    queue_order: integer(),
    queue_state: text(),
    dequeued_by: uuid(),
    dequeued_at: text(),
    dequeued_reason: text(),
    workspace: uuid().notNull(),
  },
  (table) => [unique("campaign_queue_campaign_contact_unique").on(table.campaign_id, table.contact_id)],
);

export const script = pgTable("script", {
  created_at: text().notNull(),
  created_by: uuid(),
  id: serial().notNull().primaryKey(),
  name: text().notNull(),
  steps: jsonb(),
  type: text(),
  updated_at: text(),
  updated_by: text(),
  workspace: uuid(),
});

// ─── Contact/Audience ──────────────────────────────────────

export const contact = pgTable("contact", {
  address: text(),
  city: text(),
  country: text(),
  created_at: text().notNull(),
  created_by: uuid(),
  date_updated: text(),
  email: text(),
  external_id: text(),
  firstname: text(),
  household_id: uuid(),
  id: serial().notNull().primaryKey(),
  // Twilio Lookup v2 line-type cache: null = never looked up. Populated
  // lazily on a contact's first SMS attempt and treated as permanent once set.
  line_type: text(),
  line_type_checked_at: timestamp({ withTimezone: true, mode: "string" }),
  opt_out: boolean(),
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
  audience_id: serial().notNull(),
  contact_id: serial().notNull(),
  created_at: text().notNull(),
});

export const audience = pgTable("audience", {
  created_at: text().notNull(),
  id: serial().notNull().primaryKey(),
  is_conditional: boolean().notNull(),
  name: text(),
  workspace: uuid(),
  status: text(),
  total_contacts: numeric({ mode: "number" }),
  processed_contacts: numeric({ mode: "number" }),
  processed_at: text(),
  error_message: text(),
});

export const audience_upload = pgTable("audience_upload", {
  id: serial().notNull().primaryKey(),
  audience_id: serial().notNull(),
  workspace: uuid().notNull(),
  created_by: uuid(),
  created_at: text().notNull(),
  status: text().notNull(),
  file_name: text(),
  file_size: bigint({ mode: "number" }),
  total_contacts: bigint({ mode: "number" }).notNull(),
  processed_contacts: bigint({ mode: "number" }).notNull(),
  processed_at: text(),
  error_message: text(),
  header_mapping: jsonb(),
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
  do_not_knock: boolean().notNull(),
  last_contacted_at: text(),
  created_at: text().notNull(),
  updated_at: text().notNull(),
});

// ─── Telephony ──────────────────────────────────────

export const call = pgTable("call", {
  account_sid: text(),
  answered_by: text(),
  answers: jsonb(),
  api_version: text(),
  call_duration: integer(),
  caller_name: text(),
  campaign_id: serial(),
  conference_id: text(),
  contact_id: serial(),
  date_created: text().notNull(),
  date_updated: text(),
  direction: text(),
  duration: text(),
  end_time: text(),
  forwarded_from: text(),
  from: text(),
  group_sid: text(),
  is_last: boolean().notNull(),
  outreach_attempt_id: serial(),
  parent_call_sid: text(),
  phone_number_sid: text(),
  price: text(),
  queue_id: serial(),
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
  start_time: text(),
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
  campaign_id: serial(),
  contact_id: serial(),
  date_created: text(),
  date_sent: text(),
  date_updated: text(),
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
  scheduled_at: text(),
  outreach_attempt_id: serial(),
  price: text(),
  price_unit: text(),
  sid: text().notNull(),
  status: text(),
  subresource_uris: jsonb(),
  to: text(),
  uri: text(),
  workspace: uuid().notNull(),
});

export const outreach_attempt = pgTable("outreach_attempt", {
  answered_at: text(),
  campaign_id: serial().notNull(),
  callback_audit: boolean(),
  contact_id: serial().notNull(),
  created_at: text().notNull(),
  current_step: text(),
  disposition: text(),
  ended_at: text(),
  id: serial().notNull().primaryKey(),
  issue_tags: text().array(),
  lawn_sign: boolean(),
  membership_sold: boolean(),
  result: jsonb().notNull(),
  support_level: smallint(),
  user_id: uuid(),
  volunteer_interest: text(),
  vote_by_mail: boolean(),
  workspace: uuid().notNull(),
});

// ─── Inbound Queue ──────────────────────────────────────

export const inbound_queue = pgTable("inbound_queue", {
  created_at: text().notNull(),
  description: text(),
  hold_audio: text(),
  id: serial().notNull().primaryKey(),
  name: text().notNull(),
  updated_at: text().notNull(),
  workspace_id: uuid().notNull(),
});

export const inbound_queue_member = pgTable("inbound_queue_member", {
  created_at: text().notNull(),
  id: serial().notNull().primaryKey(),
  queue_id: serial().notNull(),
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
  id: serial().notNull().primaryKey(),
  offered_at: text(),
  offered_to_user_id: text(),
  queue_id: serial().notNull(),
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
  current_queue_entry_id: serial(),
  last_heartbeat_at: text(),
  updated_at: text().notNull(),
});

export const agent_status_event = pgTable("agent_status_event", {
  id: serial().notNull().primaryKey(),
  workspace_id: uuid().notNull(),
  user_id: uuid().notNull(),
  from_status: text().notNull(),
  to_status: text().notNull(),
  reason: text(),
  created_at: text().notNull(),
});

export const workspace_events = pgTable("workspace_events", {
  id: serial().notNull().primaryKey(),
  workspace_id: uuid().notNull(),
  event_type: text().notNull(),
  payload: jsonb().notNull(),
  created_at: text().notNull(),
});

export const workspace_audit_event = pgTable("workspace_audit_event", {
  id: bigserial({ mode: "number" }).notNull().primaryKey(),
  workspace_id: text().notNull(),
  created_at: text().notNull(),
  actor_type: text().notNull(),
  actor_id: text(),
  api_key_id: bigint({ mode: "number" }),
  action: text().notNull(),
  target_type: text(),
  target_id: text(),
  outcome: text().notNull(),
  request_id: text(),
  metadata: jsonb().notNull(),
});

// Annotates objects in the workspaceAudio bucket. `file_name` (extension
// included) is the join key because every existing consumer stores a bare
// filename; a missing row means "unknown metadata", never a broken reference.
// See client/migrations/20260715120000_workspace_audio_metadata.sql.
export const workspace_audio = pgTable("workspace_audio", {
  id: bigserial({ mode: "number" }).notNull().primaryKey(),
  workspace_id: text().notNull(),
  file_name: text().notNull(),
  origin: text().notNull(),
  duration_ms: integer(),
  size_bytes: bigint({ mode: "number" }),
  content_type: text(),
  source_file_name: text(),
  clip_start_ms: integer(),
  clip_end_ms: integer(),
  created_by: text(),
  created_at: timestamp({ withTimezone: true, mode: "string" }).notNull(),
  updated_at: timestamp({ withTimezone: true, mode: "string" }).notNull(),
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
  headers: jsonb().notNull(),
  created_at: timestamp({ withTimezone: true, mode: "string" }).notNull(),
});

export const handset_session = pgTable("handset_session", {
  id: text().notNull().primaryKey(),
  user_id: uuid().notNull(),
  workspace_id: uuid().notNull(),
  client_identity: text().notNull(),
  status: text().notNull(),
  created_at: text().notNull(),
  expires_at: text().notNull(),
});

// ─── Billing ──────────────────────────────────────

export const transaction_history = pgTable("transaction_history", {
  amount: integer().notNull(),
  created_at: text().notNull(),
  id: serial().notNull().primaryKey(),
  idempotency_key: text(),
  note: text(),
  type: text().notNull(),
  workspace: uuid().notNull(),
  campaign_id: bigint({ mode: "number" }),
  call_sid: text(),
  message_sid: text(),
});

// ─── Survey ──────────────────────────────────────

export const survey = pgTable("survey", {
  id: serial().notNull().primaryKey(),
  survey_id: uuid().notNull(),
  title: text().notNull(),
  workspace: uuid().notNull(),
  is_active: boolean().notNull(),
  created_at: text().notNull(),
  updated_at: text().notNull(),
});

export const survey_page = pgTable("survey_page", {
  id: serial().notNull().primaryKey(),
  survey_id: serial().notNull(),
  page_id: uuid().notNull(),
  title: text().notNull(),
  page_order: integer().notNull(),
  created_at: text().notNull(),
  updated_at: text().notNull(),
});

export const survey_question = pgTable("survey_question", {
  id: serial().notNull().primaryKey(),
  page_id: serial().notNull(),
  question_id: uuid().notNull(),
  question_text: text().notNull(),
  question_type: text().notNull(),
  is_required: boolean().notNull(),
  question_order: integer().notNull(),
  created_at: text().notNull(),
  updated_at: text().notNull(),
});

export const question_option = pgTable("question_option", {
  id: serial().notNull().primaryKey(),
  question_id: serial().notNull(),
  option_value: text().notNull(),
  option_label: text().notNull(),
  option_order: integer().notNull(),
  created_at: text().notNull(),
});

export const survey_response = pgTable(
  "survey_response",
  {
    id: serial().notNull().primaryKey(),
    survey_id: serial().notNull(),
    result_id: text().notNull(),
    contact_id: serial(),
    started_at: text().notNull(),
    completed_at: text(),
    last_page_completed: text(),
    created_at: text().notNull(),
    updated_at: text().notNull(),
  },
  (table) => [uniqueIndex("survey_response_survey_result_unique").on(table.survey_id, table.result_id)],
);

export const response_answer = pgTable("response_answer", {
  id: serial().notNull().primaryKey(),
  response_id: serial().notNull(),
  question_id: serial().notNull(),
  answer_value: text().notNull(),
  answered_at: text().notNull(),
  created_at: text().notNull(),
});

// ─── Auth/Verification ──────────────────────────────────────

export const verification_session = pgTable("verification_session", {
  id: text().notNull().primaryKey(),
  user_id: uuid().notNull(),
  expected_caller: text().notNull(),
  status: text().notNull(),
  expires_at: text().notNull(),
  created_at: text().notNull(),
});

export const user = pgTable("user", {
  access_level: text(),
  created_at: text().notNull(),
  first_name: text(),
  id: text().notNull().primaryKey(),
  last_name: text(),
  username: text().notNull(),
  verified_audio_numbers: text().array(),
});

export const webhook = pgTable("webhook", {
  created_at: text().notNull(),
  custom_headers: jsonb().notNull(),
  destination_url: text().notNull(),
  events: jsonb(),
  id: serial().notNull().primaryKey(),
  type: text(),
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
  created_at: timestamp({ withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updated_at: timestamp({ withTimezone: true, mode: "string" }).notNull().defaultNow(),
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

