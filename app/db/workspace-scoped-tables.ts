import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import {
  agent_status,
  agent_status_event,
  audience,
  audience_upload,
  call,
  campaign,
  contact,
  email,
  email_campaign,
  handset_session,
  households,
  inbound_queue,
  inbound_queue_entry,
  inbound_queue_member,
  ivr_campaign,
  live_campaign,
  message,
  message_campaign,
  outreach_attempt,
  script,
  survey,
  transaction_history,
  twilio_cancellation_queue,
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
 * read/update/delete and auto-injects the tenancy column on every insert, so a
 * single forgotten `.where(eq(workspace, id))` can never leak cross-tenant
 * (ADR-0004). Tables without a workspace column (the `workspace` entity itself,
 * global join tables, auth/user tables) are intentionally absent and must be
 * accessed via the admin client or explicit server-side helpers.
 *
 * The registry key matches the exported schema const name, which is also the
 * key under which Drizzle exposes the relational query API (`db.query.<key>`).
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
  email: { table: email, workspaceColumn: email.workspace },
  ivr_campaign: { table: ivr_campaign, workspaceColumn: ivr_campaign.workspace },
  live_campaign: { table: live_campaign, workspaceColumn: live_campaign.workspace },
  message_campaign: { table: message_campaign, workspaceColumn: message_campaign.workspace },
  email_campaign: { table: email_campaign, workspaceColumn: email_campaign.workspace },
  workspace_number: { table: workspace_number, workspaceColumn: workspace_number.workspace },
  workspace_invite: { table: workspace_invite, workspaceColumn: workspace_invite.workspace },
  twilio_cancellation_queue: {
    table: twilio_cancellation_queue,
    workspaceColumn: twilio_cancellation_queue.workspace,
  },
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
