import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  buildDequeuedQueueUpdate,
  buildQueuedQueueUpdate,
  isAssignedToUser,
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

export type ClaimedQueueContact = {
  contact_id: number;
  queue_id: number;
  caller_id: string;
  contact_phone: string;
};

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
  return row;
}

export function buildQueueStatusUpdatePayload(status: string) {
  if (status === QUEUE_STATUS_QUEUED) {
    return buildQueuedQueueUpdate({ includeNormalizedFields: true });
  }
  if (status === QUEUE_STATUS_DEQUEUED) {
    return buildDequeuedQueueUpdate(null, "api", { includeNormalizedFields: true });
  }
  return { status };
}

export async function updateCampaignQueueStatusByIds(
  ids: number[],
  status: string,
  workspaceId?: string,
) {
  if (ids.length === 0) {
    return;
  }

  const where = workspaceId
    ? and(inArray(campaignQueueTable.id, ids), eq(campaignQueueTable.workspace, workspaceId))
    : inArray(campaignQueueTable.id, ids);

  await db.update(campaignQueueTable).set(buildQueueStatusUpdatePayload(status)).where(where);
}

export async function deleteCampaignQueueByIds(ids: number[], workspaceId?: string) {
  if (ids.length === 0) {
    return [];
  }

  const where = workspaceId
    ? and(inArray(campaignQueueTable.id, ids), eq(campaignQueueTable.workspace, workspaceId))
    : inArray(campaignQueueTable.id, ids);

  return db.delete(campaignQueueTable).where(where).returning();
}

export async function deleteAllCampaignQueueForCampaign(campaignId: number, workspaceId?: string) {
  const conditions = [eq(campaignQueueTable.campaign_id, campaignId)];
  if (workspaceId) {
    conditions.push(eq(campaignQueueTable.workspace, workspaceId));
  }

  return db.delete(campaignQueueTable).where(and(...conditions)).returning();
}

export async function deleteCampaignQueueByCampaignAndContactIds(args: {
  campaignId: number;
  contactIds: number[];
  workspaceId?: string;
}) {
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

  return db.delete(campaignQueueTable).where(and(...conditions)).returning();
}

export async function deleteQueuedUnattemptedCampaignQueueByCampaignAndContactIds(args: {
  campaignId: number;
  contactIds: number[];
  workspaceId?: string;
}) {
  if (args.contactIds.length === 0) {
    return [];
  }

  const conditions = [
    eq(campaignQueueTable.campaign_id, args.campaignId),
    inArray(campaignQueueTable.contact_id, args.contactIds),
    eq(campaignQueueTable.status, QUEUE_STATUS_QUEUED),
    eq(campaignQueueTable.attempts, 0),
  ];
  if (args.workspaceId) {
    conditions.push(eq(campaignQueueTable.workspace, args.workspaceId));
  }

  return db.delete(campaignQueueTable).where(and(...conditions)).returning();
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

export async function dequeueCampaignQueueById(args: {
  queueId: number;
  userId: string;
  reason: string;
  workspaceId?: string;
}) {
  const update = buildDequeuedQueueUpdate(args.userId, args.reason, {
    includeNormalizedFields: true,
  });
  const conditions = [eq(campaignQueueTable.id, args.queueId)];
  if (args.workspaceId) {
    conditions.push(eq(campaignQueueTable.workspace, args.workspaceId));
  }

  return db.update(campaignQueueTable).set(update).where(and(...conditions)).returning();
}

export async function updateCampaignQueueByContactAndCampaign(args: {
  contactId: number;
  campaignId: number;
  update: Record<string, unknown>;
  workspaceId?: string;
}) {
  const conditions = [
    eq(campaignQueueTable.contact_id, args.contactId),
    eq(campaignQueueTable.campaign_id, args.campaignId),
  ];
  if (args.workspaceId) {
    conditions.push(eq(campaignQueueTable.workspace, args.workspaceId));
  }

  return db.update(campaignQueueTable).set(args.update).where(and(...conditions)).returning();
}

export async function requeueAllCampaignQueueForCampaign(campaignId: number, workspaceId?: string) {
  const update = buildQueuedQueueUpdate({ includeNormalizedFields: true });
  const conditions = [eq(campaignQueueTable.campaign_id, campaignId)];
  if (workspaceId) {
    conditions.push(eq(campaignQueueTable.workspace, workspaceId));
  }

  return db.update(campaignQueueTable).set(update).where(and(...conditions)).returning();
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
  const conditions = [isNull(campaignQueueTable.dequeued_at)];
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
      status: campaignQueueTable.status,
      provider_status: campaignQueueTable.provider_status,
      group_household_queue: campaignTable.group_household_queue,
    })
    .from(campaignQueueTable)
    .innerJoin(campaignTable, eq(campaignQueueTable.campaign_id, campaignTable.id))
    .where(and(...conditions));

  return rows.find((row) => isAssignedToUser(row, userId)) ?? null;
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
  const update = buildDequeuedQueueUpdate(args.userId, args.reason, {
    includeNormalizedFields: true,
  });
  const conditions = [eq(campaignQueueTable.contact_id, args.contactId)];
  if (args.campaignId != null) {
    conditions.push(eq(campaignQueueTable.campaign_id, args.campaignId));
  }
  if (args.workspaceId) {
    conditions.push(eq(campaignQueueTable.workspace, args.workspaceId));
  }

  return db
    .update(campaignQueueTable)
    .set(update)
    .where(and(...conditions))
    .returning();
}

export async function releaseAssignedQueueForUser(
  userId: string,
  campaignId: string | number,
  workspaceId?: string,
): Promise<{ ok: true; released: number } | { ok: false; error: string }> {
  try {
    const conditions = [
      eq(campaignQueueTable.campaign_id, Number(campaignId)),
      isNull(campaignQueueTable.dequeued_at),
    ];
    if (workspaceId) {
      conditions.push(eq(campaignQueueTable.workspace, workspaceId));
    }

    const assignedRows = await db
      .select({
        id: campaignQueueTable.id,
        dequeued_at: campaignQueueTable.dequeued_at,
        assigned_to_user_id: campaignQueueTable.assigned_to_user_id,
        queue_state: campaignQueueTable.queue_state,
        status: campaignQueueTable.status,
        provider_status: campaignQueueTable.provider_status,
      })
      .from(campaignQueueTable)
      .where(and(...conditions));

    const assignedIds = assignedRows
      .filter((row) => isAssignedToUser(row, userId))
      .map((row) => row.id);

    if (assignedIds.length === 0) {
      return { ok: true, released: 0 };
    }

    const update = buildQueuedQueueUpdate({ includeNormalizedFields: true });
    const released = await db
      .update(campaignQueueTable)
      .set(update)
      .where(
        workspaceId
          ? and(
              inArray(campaignQueueTable.id, assignedIds),
              eq(campaignQueueTable.workspace, workspaceId),
            )
          : inArray(campaignQueueTable.id, assignedIds),
      )
      .returning({ id: campaignQueueTable.id });

    return { ok: true, released: released.length };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to release assigned queue rows",
    };
  }
}
