import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import {
  agent_status,
  agent_status_event,
  audience,
  audience_upload,
  call,
  campaign,
  campaign_queue,
  contact,
  handset_session,
  households,
  inbound_queue,
  inbound_voicemail_recipient,
  inbound_voicemail_delivery,
  inbound_queue_entry,
  inbound_queue_member,
  message,
  outreach_attempt,
  predictive_machine_operation,
  script,
  survey,
  transaction_history,
  webhook,
  workspace_api_key,
  workspace_audio,
  workspace_events,
  workspace_audit_event,
  workspace_invite,
  workspace_member,
  workspace_number,
  workspace_number_purchase,
  workspace_number_release,
  workspace_users,
} from "./schema";

/**
 * Registry of every table that carries a workspace-tenancy column.
 *
 * `createTenantDb(workspaceId)` auto-scopes each of these tables on every
 * read/update/delete and auto-injects the tenancy column on every insert (ADR-0004).
 * Count is asserted in test/tenant-db.test.ts against the tables declared in
 * schema.ts, so a new workspace-scoped table cannot be added without either
 * registering it here or explicitly opting out.
 */
export const WORKSPACE_SCOPED_TABLES = {
  campaign: { table: campaign, workspaceColumn: campaign.workspace, workspaceColumnName: "workspace" },
  campaign_queue: { table: campaign_queue, workspaceColumn: campaign_queue.workspace, workspaceColumnName: "workspace" },
  contact: { table: contact, workspaceColumn: contact.workspace, workspaceColumnName: "workspace" },
  audience: { table: audience, workspaceColumn: audience.workspace, workspaceColumnName: "workspace" },
  audience_upload: { table: audience_upload, workspaceColumn: audience_upload.workspace, workspaceColumnName: "workspace" },
  call: { table: call, workspaceColumn: call.workspace, workspaceColumnName: "workspace" },
  inbound_voicemail_recipient: { table: inbound_voicemail_recipient, workspaceColumn: inbound_voicemail_recipient.workspace, workspaceColumnName: "workspace" },
  inbound_voicemail_delivery: { table: inbound_voicemail_delivery, workspaceColumn: inbound_voicemail_delivery.workspace, workspaceColumnName: "workspace" },
  message: { table: message, workspaceColumn: message.workspace, workspaceColumnName: "workspace" },
  outreach_attempt: { table: outreach_attempt, workspaceColumn: outreach_attempt.workspace, workspaceColumnName: "workspace" },
  predictive_machine_operation: { table: predictive_machine_operation, workspaceColumn: predictive_machine_operation.workspace, workspaceColumnName: "workspace" },
  script: { table: script, workspaceColumn: script.workspace, workspaceColumnName: "workspace" },
  survey: { table: survey, workspaceColumn: survey.workspace, workspaceColumnName: "workspace" },
  webhook: { table: webhook, workspaceColumn: webhook.workspace, workspaceColumnName: "workspace" },
  workspace_number: { table: workspace_number, workspaceColumn: workspace_number.workspace, workspaceColumnName: "workspace" },
  workspace_number_purchase: { table: workspace_number_purchase, workspaceColumn: workspace_number_purchase.workspace, workspaceColumnName: "workspace" },
  workspace_number_release: { table: workspace_number_release, workspaceColumn: workspace_number_release.workspace, workspaceColumnName: "workspace" },
  workspace_audio: { table: workspace_audio, workspaceColumn: workspace_audio.workspace_id, workspaceColumnName: "workspace_id" },
  workspace_invite: { table: workspace_invite, workspaceColumn: workspace_invite.workspace, workspaceColumnName: "workspace" },
  transaction_history: {
    table: transaction_history,
    workspaceColumn: transaction_history.workspace,
    workspaceColumnName: "workspace",
  },
  households: { table: households, workspaceColumn: households.workspace_id, workspaceColumnName: "workspace_id" },
  inbound_queue: { table: inbound_queue, workspaceColumn: inbound_queue.workspace_id, workspaceColumnName: "workspace_id" },
  inbound_queue_member: {
    table: inbound_queue_member,
    workspaceColumn: inbound_queue_member.workspace_id,
    workspaceColumnName: "workspace_id",
  },
  inbound_queue_entry: {
    table: inbound_queue_entry,
    workspaceColumn: inbound_queue_entry.workspace_id,
    workspaceColumnName: "workspace_id",
  },
  agent_status: { table: agent_status, workspaceColumn: agent_status.workspace_id, workspaceColumnName: "workspace_id" },
  agent_status_event: {
    table: agent_status_event,
    workspaceColumn: agent_status_event.workspace_id,
    workspaceColumnName: "workspace_id",
  },
  handset_session: { table: handset_session, workspaceColumn: handset_session.workspace_id, workspaceColumnName: "workspace_id" },
  workspace_users: { table: workspace_users, workspaceColumn: workspace_users.workspace_id, workspaceColumnName: "workspace_id" },
  /** CHS membership; `workspace_id` is text (CallCaster workspace ids stored as text). */
  workspace_member: {
    table: workspace_member,
    workspaceColumn: workspace_member.workspace_id,
    workspaceColumnName: "workspace_id",
  },
  workspace_api_key: {
    table: workspace_api_key,
    workspaceColumn: workspace_api_key.workspace_id,
    workspaceColumnName: "workspace_id",
  },
  workspace_events: {
    table: workspace_events,
    workspaceColumn: workspace_events.workspace_id,
    workspaceColumnName: "workspace_id",
  },
  workspace_audit_event: {
    table: workspace_audit_event,
    workspaceColumn: workspace_audit_event.workspace_id,
    workspaceColumnName: "workspace_id",
  },
} as const;

export type WorkspaceScopedTableName = keyof typeof WORKSPACE_SCOPED_TABLES;

export type WorkspaceScopedEntry = {
  table: PgTable;
  workspaceColumn: PgColumn;
};
