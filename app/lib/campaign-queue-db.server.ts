import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import {
  buildAssignedQueueUpdate,
  buildDequeuedQueueUpdate,
  buildProviderStatusQueueUpdate,
  buildQueuedQueueUpdate,
  QUEUE_STATUS_DEQUEUED,
  QUEUE_STATUS_QUEUED,
} from "@/lib/queue-status";
import {
  campaign as campaignTable,
  campaign_queue as campaignQueueTable,
  contact as contactTable,
} from "@/db/schema";
import { db } from "@/server/db";
import type { TenantDb } from "@/server/tenant-db";
import { emitQueueEvent } from "@/lib/workspace-events.server";

export type ClaimedQueueContact = {
  contact_id: number;
  queue_id: number;
  caller_id: string;
  contact_phone: string;
};

type CampaignQueueRow = typeof campaignQueueTable.$inferSelect;

async function emitQueueRowUpdates(
  workspaceId: string,
  oldRows: CampaignQueueRow[],
  newRows: CampaignQueueRow[],
) {
  const oldById = new Map(oldRows.map((row) => [row.id, row]));
  await Promise.all(
    newRows.map((newRow) =>
      emitQueueEvent(
        workspaceId,
        "UPDATE",
        newRow as Record<string, unknown>,
        (oldById.get(newRow.id) ?? null) as Record<string, unknown> | null,
      ),
    ),
  );
}

async function emitQueueRowDeletes(workspaceId: string, deletedRows: CampaignQueueRow[]) {
  await Promise.all(
    deletedRows.map((oldRow) =>
      emitQueueEvent(workspaceId, "DELETE", null, oldRow as Record<string, unknown>),
    ),
  );
}

/**
 * Update campaign_queue rows and emit SSE postgres_change events.
 * Loads old rows once, mutates, then emits UPDATE events.
 */
async function updateCampaignQueueAndEmit(args: {
  conditions: SQL[];
  set: Record<string, unknown>;
  workspaceId?: string;
}): Promise<CampaignQueueRow[]> {
  const where = and(...args.conditions);
  const oldRows = await db.select().from(campaignQueueTable).where(where);
  const updated = await db
    .update(campaignQueueTable)
    .set(args.set)
    .where(where)
    .returning();

  const resolvedWorkspaceId = args.workspaceId ?? updated[0]?.workspace;
  if (resolvedWorkspaceId) {
    await emitQueueRowUpdates(resolvedWorkspaceId, oldRows, updated);
  }
  return updated;
}

/**
 * Delete campaign_queue rows and emit SSE DELETE events when a workspace is known.
 */
async function deleteCampaignQueueAndEmit(args: {
  conditions: SQL[];
  workspaceId?: string;
}): Promise<CampaignQueueRow[]> {
  const where = and(...args.conditions);
  const deleted = await db.delete(campaignQueueTable).where(where).returning();
  if (args.workspaceId) {
    await emitQueueRowDeletes(args.workspaceId, deleted);
  }
  return deleted;
}

/**
 * Atomically claim the next queued contact for a campaign.
 *
 * Uses the Postgres `claim_next_queue_contact` RPC which serializes per-campaign
 * claims with an advisory lock and selects the candidate row with
 * `FOR UPDATE SKIP LOCKED`. The row is updated to `status = 'assigned'` and
 * `assigned_to_user_id = userId` only if it is still queued. Returns the claimed
 * row only when the update succeeded.
 */
export async function claimNextQueueContact(
  tdb: TenantDb,
  campaignId: number,
  userId: string,
): Promise<ClaimedQueueContact | null> {
  const rows = await tdb.execute(
    sql`select * from claim_next_queue_contact(${campaignId}, ${userId}::uuid)`,
  );
  const row = rows[0] as ClaimedQueueContact | undefined;
  if (!row || !row.queue_id) return null;

  const [queueRow] = await db
    .select()
    .from(campaignQueueTable)
    .where(eq(campaignQueueTable.id, row.queue_id))
    .limit(1);
  if (queueRow) {
    await emitQueueEvent(
      queueRow.workspace,
      "UPDATE",
      queueRow as Record<string, unknown>,
      null,
    );
  }

  return row;
}

export function buildQueueStatusUpdatePayload(status: string) {
  if (status === QUEUE_STATUS_QUEUED) {
    return buildQueuedQueueUpdate();
  }
  if (status === QUEUE_STATUS_DEQUEUED) {
    return buildDequeuedQueueUpdate(null, "api");
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(status)) {
    return buildAssignedQueueUpdate(status);
  }
  return buildProviderStatusQueueUpdate(status);
}

export async function updateCampaignQueueStatusByIds(
  ids: number[],
  status: string,
  workspaceId: string,
) {
  if (ids.length === 0) {
    return;
  }

  await updateCampaignQueueAndEmit({
    conditions: [
      inArray(campaignQueueTable.id, ids),
      eq(campaignQueueTable.workspace, workspaceId),
    ],
    set: buildQueueStatusUpdatePayload(status),
    workspaceId,
  });
}

export async function deleteCampaignQueueByIds(ids: number[], workspaceId: string) {
  if (ids.length === 0) {
    return [];
  }

  return deleteCampaignQueueAndEmit({
    conditions: [
      inArray(campaignQueueTable.id, ids),
      eq(campaignQueueTable.workspace, workspaceId),
    ],
    workspaceId,
  });
}

export async function deleteAllCampaignQueueForCampaign(campaignId: number, workspaceId: string) {
  return deleteCampaignQueueAndEmit({
    conditions: [
      eq(campaignQueueTable.campaign_id, campaignId),
      eq(campaignQueueTable.workspace, workspaceId),
    ],
    workspaceId,
  });
}

export async function deleteCampaignQueueByCampaignAndContactIds(args: {
  campaignId: number;
  contactIds: number[];
  workspaceId?: string;
}) {
  if (args.contactIds.length === 0) {
    return [];
  }

  const conditions: SQL[] = [
    eq(campaignQueueTable.campaign_id, args.campaignId),
    inArray(campaignQueueTable.contact_id, args.contactIds),
  ];
  if (args.workspaceId) {
    conditions.push(eq(campaignQueueTable.workspace, args.workspaceId));
  }

  return deleteCampaignQueueAndEmit({
    conditions,
    workspaceId: args.workspaceId,
  });
}

export async function deleteQueuedUnattemptedCampaignQueueByCampaignAndContactIds(args: {
  campaignId: number;
  contactIds: number[];
  workspaceId?: string;
}) {
  if (args.contactIds.length === 0) {
    return [];
  }

  const conditions: SQL[] = [
    eq(campaignQueueTable.campaign_id, args.campaignId),
    inArray(campaignQueueTable.contact_id, args.contactIds),
    eq(campaignQueueTable.queue_state, QUEUE_STATUS_QUEUED),
    eq(campaignQueueTable.attempts, 0),
  ];
  if (args.workspaceId) {
    conditions.push(eq(campaignQueueTable.workspace, args.workspaceId));
  }

  return deleteCampaignQueueAndEmit({
    conditions,
    workspaceId: args.workspaceId,
  });
}

export async function getCampaignQueueContactIds(
  campaignId: number,
  workspaceId?: string,
): Promise<number[]> {
  const conditions = [eq(campaignQueueTable.campaign_id, campaignId)];
  if (workspaceId) {
    conditions.push(eq(campaignQueueTable.workspace, workspaceId));
  }

  const rows = await db
    .select({ contact_id: campaignQueueTable.contact_id })
    .from(campaignQueueTable)
    .where(and(...conditions));
  return rows.map((row) => row.contact_id);
}

export async function getQueuedContactIdsForCampaign(args: {
  campaignId: number;
  contactIds: number[];
  workspaceId?: string;
}): Promise<number[]> {
  if (args.contactIds.length === 0) {
    return [];
  }

  const conditions = [
    eq(campaignQueueTable.campaign_id, args.campaignId),
    inArray(campaignQueueTable.contact_id, args.contactIds),
  ];
  if (args.workspaceId) {
    conditions.push(eq(campaignQueueTable.workspace, args.workspaceId));
  }

  const rows = await db
    .select({ contact_id: campaignQueueTable.contact_id })
    .from(campaignQueueTable)
    .where(and(...conditions));
  return rows.map((row) => row.contact_id);
}

/**
 * Revert a claimed campaign_queue row back to `queued`. Used to release a
 * contact claimed by `claim_next_queue_contact` when the subsequent dial
 * attempt fails before a Twilio call is actually placed (e.g. the Twilio API
 * call itself throws) — otherwise the contact is stuck "assigned" forever
 * and the predictive dialer can never retry it.
 */
export async function requeueCampaignQueueById(queueId: number, workspaceId?: string) {
  const conditions: SQL[] = [eq(campaignQueueTable.id, queueId)];
  if (workspaceId) {
    conditions.push(eq(campaignQueueTable.workspace, workspaceId));
  }

  return updateCampaignQueueAndEmit({
    conditions,
    set: buildQueuedQueueUpdate(),
    workspaceId,
  });
}

export async function dequeueCampaignQueueById(args: {
  queueId: number;
  userId: string;
  reason: string;
  workspaceId?: string;
}) {
  const conditions: SQL[] = [eq(campaignQueueTable.id, args.queueId)];
  if (args.workspaceId) {
    conditions.push(eq(campaignQueueTable.workspace, args.workspaceId));
  }

  return updateCampaignQueueAndEmit({
    conditions,
    set: buildDequeuedQueueUpdate(args.userId, args.reason),
    workspaceId: args.workspaceId,
  });
}

export async function updateCampaignQueueByContactAndCampaign(args: {
  contactId: number;
  campaignId: number;
  update: Record<string, unknown>;
  workspaceId?: string;
}) {
  const conditions: SQL[] = [
    eq(campaignQueueTable.contact_id, args.contactId),
    eq(campaignQueueTable.campaign_id, args.campaignId),
  ];
  if (args.workspaceId) {
    conditions.push(eq(campaignQueueTable.workspace, args.workspaceId));
  }

  return updateCampaignQueueAndEmit({
    conditions,
    set: args.update,
    workspaceId: args.workspaceId,
  });
}

export async function requeueAllCampaignQueueForCampaign(campaignId: number, workspaceId?: string) {
  const conditions: SQL[] = [eq(campaignQueueTable.campaign_id, campaignId)];
  if (workspaceId) {
    conditions.push(eq(campaignQueueTable.workspace, workspaceId));
  }

  return updateCampaignQueueAndEmit({
    conditions,
    set: buildQueuedQueueUpdate(),
    workspaceId,
  });
}

export async function fetchCampaignQueueRowsByIds(queueIds: number[], workspaceId?: string) {
  if (queueIds.length === 0) {
    return [];
  }

  const conditions = [inArray(campaignQueueTable.id, queueIds)];
  if (workspaceId) {
    conditions.push(eq(campaignQueueTable.workspace, workspaceId));
  }

  const queueRows = await db
    .select()
    .from(campaignQueueTable)
    .where(and(...conditions));

  if (queueRows.length === 0) {
    return [];
  }

  const contactIds = [...new Set(queueRows.map((row) => row.contact_id))];
  const contacts = await db
    .select()
    .from(contactTable)
    .where(inArray(contactTable.id, contactIds));
  const contactById = new Map(contacts.map((contact) => [contact.id, contact]));

  return queueRows.map((queueRow) => ({
    ...queueRow,
    contact: contactById.get(queueRow.contact_id) ?? null,
  }));
}

export async function findActiveAssignedQueueForUser(userId: string, workspaceId?: string) {
  const conditions = [
    isNull(campaignQueueTable.dequeued_at),
    eq(campaignQueueTable.assigned_to_user_id, userId),
  ];
  if (workspaceId) {
    conditions.push(eq(campaignQueueTable.workspace, workspaceId));
  }

  const rows = await db
    .select({
      id: campaignQueueTable.id,
      contact_id: campaignQueueTable.contact_id,
      campaign_id: campaignQueueTable.campaign_id,
      assigned_to_user_id: campaignQueueTable.assigned_to_user_id,
      queue_state: campaignQueueTable.queue_state,
      dequeued_at: campaignQueueTable.dequeued_at,
      provider_status: campaignQueueTable.provider_status,
      group_household_queue: campaignTable.group_household_queue,
    })
    .from(campaignQueueTable)
    .innerJoin(campaignTable, eq(campaignQueueTable.campaign_id, campaignTable.id))
    .where(and(...conditions))
    .limit(1);

  return rows[0] ?? null;
}

export async function resolveContactWorkspaceIdFromQueue(
  contactId: number,
  workspaceId?: string,
): Promise<string | null> {
  const conditions = [eq(campaignQueueTable.contact_id, contactId)];
  if (workspaceId) {
    conditions.push(eq(campaignQueueTable.workspace, workspaceId));
  }

  const [row] = await db
    .select({ workspace: campaignQueueTable.workspace })
    .from(campaignQueueTable)
    .where(and(...conditions))
    .limit(1);

  return row?.workspace ?? null;
}

/** Dequeue campaign_queue rows for a contact (optionally scoped to one campaign). */
export async function dequeueCampaignQueueByContact(args: {
  contactId: number;
  campaignId?: number | null;
  userId: string;
  reason: string;
  workspaceId?: string;
}) {
  const conditions: SQL[] = [eq(campaignQueueTable.contact_id, args.contactId)];
  if (args.campaignId != null) {
    conditions.push(eq(campaignQueueTable.campaign_id, args.campaignId));
  }
  if (args.workspaceId) {
    conditions.push(eq(campaignQueueTable.workspace, args.workspaceId));
  }

  return updateCampaignQueueAndEmit({
    conditions,
    set: buildDequeuedQueueUpdate(args.userId, args.reason),
    workspaceId: args.workspaceId,
  });
}

export async function releaseAssignedQueueForUser(
  userId: string,
  campaignId: string | number,
  workspaceId?: string,
): Promise<{ ok: true; released: number } | { ok: false; error: string }> {
  try {
    const conditions: SQL[] = [
      eq(campaignQueueTable.campaign_id, Number(campaignId)),
      isNull(campaignQueueTable.dequeued_at),
      eq(campaignQueueTable.assigned_to_user_id, userId),
    ];
    if (workspaceId) {
      conditions.push(eq(campaignQueueTable.workspace, workspaceId));
    }

    const assignedRows = await db
      .select({ id: campaignQueueTable.id })
      .from(campaignQueueTable)
      .where(and(...conditions));

    const assignedIds = assignedRows.map((row) => row.id);

    if (assignedIds.length === 0) {
      return { ok: true, released: 0 };
    }

    const updateConditions: SQL[] = [inArray(campaignQueueTable.id, assignedIds)];
    if (workspaceId) {
      updateConditions.push(eq(campaignQueueTable.workspace, workspaceId));
    }

    const released = await updateCampaignQueueAndEmit({
      conditions: updateConditions,
      set: buildQueuedQueueUpdate(),
      workspaceId,
    });

    return { ok: true, released: released.length };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to release assigned queue rows",
    };
  }
}
