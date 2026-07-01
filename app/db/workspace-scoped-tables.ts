import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import {
  agent_status,
  agent_status_event,
  audience,
  audience_upload,
  call,
  campaign,
  contact,
  contact_audience,
  handset_session,
  households,
  inbound_queue,
  inbound_queue_entry,
  inbound_queue_member,
  message,
  outreach_attempt,
  script,
  survey,
  transaction_history,
  webhook,
  workspace_api_key,
  workspace_invite,
  workspace_number,
  workspace_users,
} from "./schema";

/**
 * Registry of every table that carries a workspace-tenancy column.
 *
 * `createTenantDb(workspaceId)` auto-scopes each of these tables on every
 * read/update/delete and auto-injects the tenancy column on every insert (ADR-0004).
 * Count: 22 tables after Phase 1 schema transform (vestigial/subtype tables removed).
 */
export const WORKSPACE_SCOPED_TABLES = {
  campaign: { table: campaign, workspaceColumn: campaign.workspace },
  contact: { table: contact, workspaceColumn: contact.workspace },
  audience: { table: audience, workspaceColumn: audience.workspace },
  audience_upload: { table: audience_upload, workspaceColumn: audience_upload.workspace },
  call: { table: call, workspaceColumn: call.workspace },
  message: { table: message, workspaceColumn: message.workspace },
  outreach_attempt: { table: outreach_attempt, workspaceColumn: outreach_attempt.workspace },
  script: { table: script, workspaceColumn: script.workspace },
  survey: { table: survey, workspaceColumn: survey.workspace },
  webhook: { table: webhook, workspaceColumn: webhook.workspace },
  workspace_number: { table: workspace_number, workspaceColumn: workspace_number.workspace },
  workspace_invite: { table: workspace_invite, workspaceColumn: workspace_invite.workspace },
  transaction_history: {
    table: transaction_history,
    workspaceColumn: transaction_history.workspace,
  },
  households: { table: households, workspaceColumn: households.workspace_id },
  inbound_queue: { table: inbound_queue, workspaceColumn: inbound_queue.workspace_id },
  inbound_queue_member: {
    table: inbound_queue_member,
    workspaceColumn: inbound_queue_member.workspace_id,
  },
  inbound_queue_entry: {
    table: inbound_queue_entry,
    workspaceColumn: inbound_queue_entry.workspace_id,
  },
  agent_status: { table: agent_status, workspaceColumn: agent_status.workspace_id },
  agent_status_event: {
    table: agent_status_event,
    workspaceColumn: agent_status_event.workspace_id,
  },
  handset_session: { table: handset_session, workspaceColumn: handset_session.workspace_id },
  workspace_users: { table: workspace_users, workspaceColumn: workspace_users.workspace_id },
  workspace_api_key: {
    table: workspace_api_key,
    workspaceColumn: workspace_api_key.workspace_id,
  },
} as const;

export type WorkspaceScopedTableName = keyof typeof WORKSPACE_SCOPED_TABLES;

export type WorkspaceScopedEntry = {
  table: PgTable;
  workspaceColumn: PgColumn;
};
