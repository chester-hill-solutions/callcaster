import { eq } from "drizzle-orm";
import {
  call as callTable,
  script as scriptTable,
  webhook as webhookTable,
  workspace as workspaceTable,
  workspace_number as workspaceNumberTable,
} from "@/db/schema";
import { db } from "@/server/db";
import { adminDb } from "@/server/admin-db";
import { createTenantDb } from "@/server/tenant-db";
import { insertCallForWorkspace, updateCallBySid } from "@/lib/telephony-db.server";

type CallRow = typeof callTable.$inferSelect;

export type InboundWorkspaceNumberRow = {
  id: number;
  handset_enabled: boolean | null;
  inbound_action: string | null;
  inbound_audio: string | null;
  inbound_queue_id: number | null;
  inbound_script_id: number | null;
  inbound_ring_count: number | null;
  type: string | null;
  workspaceId: string;
};

/** Global lookup by dialed number (Twilio `Called` — no workspace id on webhook). */
export async function findWorkspaceNumberByPhoneNumber(
  phoneNumber: string,
): Promise<InboundWorkspaceNumberRow | null> {
  const [row] = await db
    .select({
      id: workspaceNumberTable.id,
      handset_enabled: workspaceNumberTable.handset_enabled,
      inbound_action: workspaceNumberTable.inbound_action,
      inbound_audio: workspaceNumberTable.inbound_audio,
      inbound_queue_id: workspaceNumberTable.inbound_queue_id,
      inbound_script_id: workspaceNumberTable.inbound_script_id,
      inbound_ring_count: workspaceNumberTable.inbound_ring_count,
      type: workspaceNumberTable.type,
      workspaceId: workspaceNumberTable.workspace,
    })
    .from(workspaceNumberTable)
    .where(eq(workspaceNumberTable.phone_number, phoneNumber))
    .limit(1);

  if (!row?.workspaceId) {
    return null;
  }

  return row;
}

export async function findWorkspaceNumberInboundFallbackByPhone(phoneNumber: string) {
  const [row] = await db
    .select({
      inbound_action: workspaceNumberTable.inbound_action,
      inbound_audio: workspaceNumberTable.inbound_audio,
      workspaceId: workspaceNumberTable.workspace,
    })
    .from(workspaceNumberTable)
    .where(eq(workspaceNumberTable.phone_number, phoneNumber))
    .limit(1);

  if (!row?.workspaceId) {
    return null;
  }

  return row;
}

export async function upsertInboundCallRecord(args: {
  workspaceId: string;
  sid: string;
  values: Partial<CallRow>;
}): Promise<CallRow | null> {
  const existing = await db
    .select({ sid: callTable.sid })
    .from(callTable)
    .where(eq(callTable.sid, args.sid))
    .limit(1);

  if (existing[0]) {
    return updateCallBySid(args.workspaceId, args.sid, args.values);
  }

  return insertCallForWorkspace(args.workspaceId, {
    ...args.values,
    sid: args.sid,
    date_created: args.values.date_created ?? new Date().toISOString(),
    is_last: args.values.is_last ?? false,
  });
}

export async function findInboundIvrScriptSteps(args: {
  workspaceId: string;
  scriptId: number;
}): Promise<Record<string, unknown> | null | undefined> {
  const tdb = createTenantDb(args.workspaceId);
  const script = await tdb.script.findFirst({
    where: eq(scriptTable.id, args.scriptId),
    columns: { steps: true },
  });
  return script?.steps as Record<string, unknown> | null | undefined;
}

export function workspaceWebhookHasInboundCallInsert(
  webhook: { event: string[] | null | undefined } | null | undefined,
): boolean {
  if (!webhook?.event?.length) {
    return false;
  }
  return webhook.event.includes("INSERT");
}

export async function listWorkspaceNumberTwilioCandidatesByPhone(
  phoneNumber: string,
): Promise<Array<{ twilioData: unknown }>> {
  const rows = await adminDb
    .select({ twilioData: workspaceTable.twilio_data })
    .from(workspaceNumberTable)
    .innerJoin(
      workspaceTable,
      eq(workspaceNumberTable.workspace, workspaceTable.id),
    )
    .where(eq(workspaceNumberTable.phone_number, phoneNumber));

  return rows.map((row) => ({ twilioData: row.twilioData }));
}

export async function updateWorkspaceNumberCapabilitiesByPhone(
  phoneNumber: string,
  capabilities: Record<string, unknown>,
) {
  const rows = await db
    .update(workspaceNumberTable)
    .set({ capabilities: capabilities as typeof workspaceNumberTable.$inferInsert.capabilities })
    .where(eq(workspaceNumberTable.phone_number, phoneNumber))
    .returning();
  return rows;
}

export async function findWorkspaceNumberVoicemailContextByPhone(phoneNumber: string) {
  const [row] = await adminDb
    .select({
      inbound_action: workspaceNumberTable.inbound_action,
      type: workspaceNumberTable.type,
      workspaceId: workspaceNumberTable.workspace,
      workspaceName: workspaceTable.name,
      workspaceTwilioData: workspaceTable.twilio_data,
    })
    .from(workspaceNumberTable)
    .innerJoin(
      workspaceTable,
      eq(workspaceNumberTable.workspace, workspaceTable.id),
    )
    .where(eq(workspaceNumberTable.phone_number, phoneNumber))
    .limit(1);

  if (!row?.workspaceId) {
    return null;
  }

  const webhooks = await adminDb
    .select()
    .from(webhookTable)
    .where(eq(webhookTable.workspace, row.workspaceId));

  return {
    inbound_action: row.inbound_action,
    type: row.type,
    workspace: {
      id: row.workspaceId,
      name: row.workspaceName,
      twilio_data: row.workspaceTwilioData,
      webhook: webhooks,
    },
  };
}
