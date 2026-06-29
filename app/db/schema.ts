// Generated from app/lib/database.types.ts + supabase/migrations/*.sql
// Hand-maintained — update when schema changes

import {
  pgTable, text, integer, boolean, timestamp, jsonb, uuid, serial, smallint, pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const agent_state = pgEnum("agent_state", ["offline","available","busy","wrap_up","away"]);
export const answered_by = pgEnum("answered_by", ["human","machine","unknown"]);
export const call_status = pgEnum("call_status", ["queued","ringing","in-progress","canceled","completed","failed","busy","no-answer","initiated"]);
export const campaign_phase = pgEnum("campaign_phase", ["identification","persuasion","gotv"]);
export const campaign_status = pgEnum("campaign_status", ["pending","scheduled","running","complete","paused","draft","archived"]);
export const campaign_type = pgEnum("campaign_type", ["message","robocall","simple_ivr","complex_ivr","live_call","email"]);
export const dial_types = pgEnum("dial_types", ["call","predictive"]);
export const message_direction = pgEnum("message_direction", ["inbound","outbound-api","outbound-call","outbound-reply"]);
export const message_status = pgEnum("message_status", ["accepted","scheduled","canceled","queued","sending","sent","failed","delivered","undelivered","receiving","received","read"]);
export const queue_entry_state = pgEnum("queue_entry_state", ["queued","offered","accepted","declined","timed_out","abandoned","completed"]);
export const queue_status = pgEnum("queue_status", ["queued","dequeued"]);
export const voter_list_source = pgEnum("voter_list_source", ["liberalist","van","elections_canada","elections_ontario","manual","other"]);
export const workspace_role = pgEnum("workspace_role", ["owner","member","caller","admin"]);

// ─── Workspace ──────────────────────────────────────

export const workspace = pgTable("workspace", {
  created_at: text().notNull(),
  credits: integer().notNull(),
  cutoff_time: text().notNull(),
  disabled: boolean().notNull(),
  feature_flags: jsonb().notNull(),
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

export const workspace_api_key = pgTable("workspace_api_key", {
  id: text().notNull().primaryKey(),
  workspace_id: uuid().notNull(),
  name: text().notNull(),
  key_prefix: text().notNull(),
  key_hash: text().notNull(),
  created_by: uuid(),
  created_at: text().notNull(),
  last_used_at: text(),
});

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
  type: text().notNull(),
  workspace: uuid().notNull(),
});

export const workspace_permissions = pgTable("workspace_permissions", {
  id: serial().notNull().primaryKey(),
  permission: text().notNull(),
  role: text().notNull(),
});

// ─── Campaign ──────────────────────────────────────

export const campaign = pgTable("campaign", {
  call_questions: jsonb(),
  caller_id: text(),
  created_at: text().notNull(),
  dial_ratio: integer().notNull(),
  dial_type: text(),
  end_date: text(),
  group_household_queue: boolean().notNull(),
  id: serial().notNull().primaryKey(),
  is_active: boolean().notNull(),
  next_queue_order: integer().notNull(),
  phase: text(),
  schedule: jsonb(),
  sms_messaging_service_sid: text(),
  sms_send_mode: text(),
  start_date: text(),
  status: text(),
  title: text().notNull(),
  type: text(),
  voicemail_file: text(),
  workspace: uuid(),
});

export const campaign_audience = pgTable("campaign_audience", {
  audience_id: serial().notNull(),
  campaign_id: serial().notNull(),
  created_at: text().notNull(),
});

export const campaign_queue = pgTable("campaign_queue", {
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
  status: text().notNull(),
  dequeued_by: text(),
  dequeued_at: text(),
  dequeued_reason: text(),
});

export const campaign_schedule_jobs = pgTable("campaign_schedule_jobs", {
  campaign_id: serial().notNull(),
  end_ids: integer().array(),
  end_job_id: serial(),
  start_ids: integer().array(),
  start_job_id: serial(),
});

export const ivr_campaign = pgTable("ivr_campaign", {
  campaign_id: serial().notNull(),
  created_at: text().notNull(),
  id: serial().notNull().primaryKey(),
  script_id: serial(),
  workspace: uuid().notNull(),
});

export const live_campaign = pgTable("live_campaign", {
  campaign_id: serial(),
  created_at: text().notNull(),
  disposition_options: jsonb().notNull(),
  id: serial().notNull().primaryKey(),
  questions: jsonb().notNull(),
  script_id: serial(),
  voicedrop_audio: text(),
  workspace: uuid().notNull(),
});

export const message_campaign = pgTable("message_campaign", {
  body_text: text(),
  campaign_id: serial(),
  created_at: text().notNull(),
  id: serial().notNull().primaryKey(),
  message_media: text().array(),
  workspace: uuid().notNull(),
});

export const email_campaign = pgTable("email_campaign", {
  campaign_id: serial().notNull(),
  created_at: text().notNull(),
  email_id: serial(),
  id: serial().notNull().primaryKey(),
  workspace: uuid().notNull(),
});

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
  address_id: text(),
  carrier: text(),
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
  opt_out: boolean(),
  other_data: text().notNull(),
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
  fullname: text(),
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
  total_contacts: integer(),
  processed_contacts: integer(),
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
  file_size: integer(),
  total_contacts: integer().notNull(),
  processed_contacts: integer().notNull(),
  processed_at: text(),
  error_message: text(),
  header_mapping: jsonb(),
  split_name_column: text(),
});

export const audience_rule = pgTable("audience_rule", {
  audience_id: serial().notNull(),
  conditions: jsonb().notNull(),
  created_at: text().notNull(),
  id: serial().notNull().primaryKey(),
  logic: text().notNull(),
  updated_at: text(),
  updated_by: text(),
});

export const households = pgTable("households", {
  id: text().notNull().primaryKey(),
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
  from_formatted: text(),
  group_sid: text(),
  is_last: boolean().notNull(),
  outreach_attempt_id: serial(),
  parent_call_sid: text(),
  phone_number_sid: text(),
  price: text(),
  price_unit: text(),
  queue_id: serial(),
  queue_time: text(),
  recording_duration: text(),
  recording_sid: text(),
  recording_url: text(),
  sid: text().notNull(),
  start_time: text(),
  status: text(),
  subresource_uris: jsonb(),
  to: text(),
  to_formatted: text(),
  trunk_sid: text(),
  uri: text(),
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

export const twilio_cancellation_queue = pgTable("twilio_cancellation_queue", {
  call_sid: text().notNull(),
  created_at: text().notNull(),
  id: serial().notNull().primaryKey(),
  processed_at: text(),
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
  status: text().notNull(),
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

export const survey_response = pgTable("survey_response", {
  id: serial().notNull().primaryKey(),
  survey_id: serial().notNull(),
  result_id: text().notNull(),
  contact_id: serial(),
  started_at: text().notNull(),
  completed_at: text(),
  last_page_completed: text(),
  created_at: text().notNull(),
  updated_at: text().notNull(),
});

export const response_answer = pgTable("response_answer", {
  id: serial().notNull().primaryKey(),
  response_id: serial().notNull(),
  question_id: serial().notNull(),
  answer_value: text().notNull(),
  answered_at: text().notNull(),
  created_at: text().notNull(),
});

// ─── Auth/Verification ──────────────────────────────────────

export const phone_verification = pgTable("phone_verification", {
  id: text().notNull().primaryKey(),
  user_id: uuid().notNull(),
  phone_number: text().notNull(),
  pin: text().notNull(),
  expires_at: text().notNull(),
  created_at: text().notNull(),
});

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
  activity: jsonb().notNull(),
  created_at: text().notNull(),
  first_name: text(),
  id: text().notNull().primaryKey(),
  last_name: text(),
  organization: integer(),
  username: text().notNull(),
  verified_audio_numbers: text().array(),
});

export const webhook = pgTable("webhook", {
  created_at: text().notNull(),
  custom_headers: jsonb().notNull(),
  destination_url: text().notNull(),
  event: text().array().notNull(),
  id: serial().notNull().primaryKey(),
  type: text(),
  updated_at: text(),
  updated_by: text(),
  workspace: uuid().notNull(),
});

// ─── Email ──────────────────────────────────────

export const email = pgTable("email", {
  created_at: text().notNull(),
  created_by: uuid(),
  design: jsonb(),
  id: serial().notNull().primaryKey(),
  name: text().notNull(),
  updated_at: text(),
  updated_by: text(),
  workspace: uuid(),
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

export const audience_ruleRelations = relations(audience_rule, ({ one }) => ({
  audience: one(audience, { fields: [audience_rule.audience_id], references: [audience.id] }),
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

export const ivr_campaignRelations = relations(ivr_campaign, ({ one }) => ({
  script: one(script, { fields: [ivr_campaign.script_id], references: [script.id] }),
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

