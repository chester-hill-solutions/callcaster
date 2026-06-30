import { and, eq, inArray, isNull } from "drizzle-orm";
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

export function buildQueueStatusUpdatePayload(status: string) {
  if (status === QUEUE_STATUS_QUEUED) {
    return buildQueuedQueueUpdate({ includeNormalizedFields: true });
  }
  if (status === QUEUE_STATUS_DEQUEUED) {
    return buildDequeuedQueueUpdate(null, "api", { includeNormalizedFields: true });
  }
  return { status };
}

export async function updateCampaignQueueStatusByIds(ids: number[], status: string) {
  if (ids.length === 0) {
    return;
  }

  await db
    .update(campaignQueueTable)
    .set(buildQueueStatusUpdatePayload(status))
    .where(inArray(campaignQueueTable.id, ids));
}

export async function deleteCampaignQueueByIds(ids: number[]) {
  if (ids.length === 0) {
    return [];
  }

  return db
    .delete(campaignQueueTable)
    .where(inArray(campaignQueueTable.id, ids))
    .returning();
}

export async function deleteAllCampaignQueueForCampaign(campaignId: number) {
  return db
    .delete(campaignQueueTable)
    .where(eq(campaignQueueTable.campaign_id, campaignId))
    .returning();
}

export async function deleteCampaignQueueByCampaignAndContactIds(args: {
  campaignId: number;
  contactIds: number[];
}) {
  if (args.contactIds.length === 0) {
    return [];
  }

  return db
    .delete(campaignQueueTable)
    .where(
      and(
        eq(campaignQueueTable.campaign_id, args.campaignId),
        inArray(campaignQueueTable.contact_id, args.contactIds),
      ),
    )
    .returning();
}

export async function deleteQueuedUnattemptedCampaignQueueByCampaignAndContactIds(args: {
  campaignId: number;
  contactIds: number[];
}) {
  if (args.contactIds.length === 0) {
    return [];
  }

  return db
    .delete(campaignQueueTable)
    .where(
      and(
        eq(campaignQueueTable.campaign_id, args.campaignId),
        inArray(campaignQueueTable.contact_id, args.contactIds),
        eq(campaignQueueTable.status, QUEUE_STATUS_QUEUED),
        eq(campaignQueueTable.attempts, 0),
      ),
    )
    .returning();
}

export async function getCampaignQueueContactIds(campaignId: number): Promise<number[]> {
  const rows = await db
    .select({ contact_id: campaignQueueTable.contact_id })
    .from(campaignQueueTable)
    .where(eq(campaignQueueTable.campaign_id, campaignId));
  return rows.map((row) => row.contact_id);
}

export async function getQueuedContactIdsForCampaign(args: {
  campaignId: number;
  contactIds: number[];
}): Promise<number[]> {
  if (args.contactIds.length === 0) {
    return [];
  }

  const rows = await db
    .select({ contact_id: campaignQueueTable.contact_id })
    .from(campaignQueueTable)
    .where(
      and(
        eq(campaignQueueTable.campaign_id, args.campaignId),
        inArray(campaignQueueTable.contact_id, args.contactIds),
      ),
    );
  return rows.map((row) => row.contact_id);
}

export async function dequeueCampaignQueueById(args: {
  queueId: number;
  userId: string;
  reason: string;
}) {
  const update = buildDequeuedQueueUpdate(args.userId, args.reason, {
    includeNormalizedFields: true,
  });
  return db
    .update(campaignQueueTable)
    .set(update)
    .where(eq(campaignQueueTable.id, args.queueId))
    .returning();
}

export async function updateCampaignQueueByContactAndCampaign(args: {
  contactId: number;
  campaignId: number;
  update: Record<string, unknown>;
}) {
  return db
    .update(campaignQueueTable)
    .set(args.update)
    .where(
      and(
        eq(campaignQueueTable.contact_id, args.contactId),
        eq(campaignQueueTable.campaign_id, args.campaignId),
      ),
    )
    .returning();
}

export async function requeueAllCampaignQueueForCampaign(campaignId: number) {
  const update = buildQueuedQueueUpdate({ includeNormalizedFields: true });
  return db
    .update(campaignQueueTable)
    .set(update)
    .where(eq(campaignQueueTable.campaign_id, campaignId))
    .returning();
}

export async function fetchCampaignQueueRowsByIds(queueIds: number[]) {
  if (queueIds.length === 0) {
    return [];
  }

  const queueRows = await db
    .select()
    .from(campaignQueueTable)
    .where(inArray(campaignQueueTable.id, queueIds));

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

export async function findActiveAssignedQueueForUser(userId: string) {
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
    .where(isNull(campaignQueueTable.dequeued_at));

  return rows.find((row) => isAssignedToUser(row, userId)) ?? null;
}

export async function resolveContactWorkspaceIdFromQueue(
  contactId: number,
): Promise<string | null> {
  const [row] = await db
    .select({ workspace: campaignTable.workspace })
    .from(campaignQueueTable)
    .innerJoin(campaignTable, eq(campaignQueueTable.campaign_id, campaignTable.id))
    .where(eq(campaignQueueTable.contact_id, contactId))
    .limit(1);

  return row?.workspace ?? null;
}

/** Dequeue campaign_queue rows for a contact (optionally scoped to one campaign). */
export async function dequeueCampaignQueueByContact(args: {
  contactId: number;
  campaignId?: number | null;
  userId: string;
  reason: string;
}) {
  const update = buildDequeuedQueueUpdate(args.userId, args.reason, {
    includeNormalizedFields: true,
  });
  const conditions = [eq(campaignQueueTable.contact_id, args.contactId)];
  if (args.campaignId != null) {
    conditions.push(eq(campaignQueueTable.campaign_id, args.campaignId));
  }

  return db
    .update(campaignQueueTable)
    .set(update)
    .where(and(...conditions))
    .returning();
}

export async function releaseAssignedQueueForUser(
  _supabaseClient: unknown,
  userId: string,
  campaignId: string | number,
): Promise<{ ok: true; released: number } | { ok: false; error: string }> {
  try {
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
      .where(
        and(
          eq(campaignQueueTable.campaign_id, Number(campaignId)),
          isNull(campaignQueueTable.dequeued_at),
        ),
      );

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
      .where(inArray(campaignQueueTable.id, assignedIds))
      .returning({ id: campaignQueueTable.id });

    return { ok: true, released: released.length };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to release assigned queue rows",
    };
  }
}
