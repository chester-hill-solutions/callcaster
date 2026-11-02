import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { call, campaign, campaign_queue, contact, outreach_attempt, workspace, workspace_voice_reservation } from "@/db/schema";
import { db } from "./db";
import { createTenantDb, type TenantDb } from "./tenant-db";
import { isTerminalStatus, normalizeProviderStatus } from "@/lib/call-status";
import { dequeueQueueEntry } from "@/lib/campaign-queue-db.server";
import { assignedElsewhere, hasLiveQueueCustomer, wasDequeued } from "./queue-advance-ownership.server";
import { logger } from "@/lib/logger.server";

type SavedCall = typeof call.$inferSelect;
type LegacyOwner = { queueId: number | null; campaignId: number; contactId: number; attemptId: number;
  actorId: string | null; ignoredCallSids: string[] };

function savedParentMatches(source: SavedCall, parent: SavedCall | null) {
  if (!parent) return true;
  if (parent.account_sid !== source.account_sid) return false;
  return (["queue_id", "campaign_id", "contact_id", "outreach_attempt_id", "user_id"] as const)
    .every(key => source[key] === null || parent[key] === null || source[key] === parent[key]);
}

function legacyQueueIdentity(source: SavedCall, parent: SavedCall | null) {
  const queueId = source.queue_id ?? parent?.queue_id ?? null, campaignId = source.campaign_id ?? parent?.campaign_id;
  const contactId = source.contact_id ?? parent?.contact_id, attemptId = source.outreach_attempt_id ?? parent?.outreach_attempt_id;
  if (campaignId == null || contactId == null || attemptId == null) return null;
  return { queueId, campaignId, contactId, attemptId };
}

/** Legacy child legs can use only their saved parent, never today's queue owner. */
async function readLegacyOwner(tdb: TenantDb, callSid: string): Promise<LegacyOwner | null> {
  const source = await tdb.call.findFirst({ where: eq(call.sid, callSid) });
  if (!source || !isTerminalStatus(normalizeProviderStatus(source.status))) return null;
  const funded = await tdb.workspace_voice_reservation.findFirst({ where: or(
    eq(workspace_voice_reservation.provider_sid, callSid), eq(workspace_voice_reservation.setup_sid, callSid),
  ), columns: { id: true } });
  if (funded) return null;
  const parent = source.parent_call_sid ? await tdb.call.findFirst({ where: eq(call.sid, source.parent_call_sid) }) ?? null : null;
  if (source.parent_call_sid && !parent && source.queue_id === null) return null;
  if (!savedParentMatches(source, parent)) return null;
  const identity = legacyQueueIdentity(source, parent);
  if (!identity) return null;
  const { campaignId, contactId, attemptId } = identity;
  const attempt = await tdb.outreach_attempt.findFirst({ where: and(
    eq(outreach_attempt.id, attemptId), eq(outreach_attempt.campaign_id, campaignId), eq(outreach_attempt.contact_id, contactId),
  ) });
  if (!attempt) return null;
  const actorId = source.user_id ?? parent?.user_id ?? attempt.user_id;
  if ((attempt.user_id && actorId !== attempt.user_id) || (parent?.user_id && actorId !== parent.user_id)) return null;
  return { ...identity, actorId, ignoredCallSids: parent ? [parent.sid] : [] };
}

/** Compare full database timestamps; provider callbacks can rewrite Call.date_created. */
function belongsToLegacyAttempt(workspaceId: string, owner: LegacyOwner) {
  return sql`exists (select 1 from public.outreach_attempt origin
    where origin.workspace = ${workspaceId}::uuid and origin.id = ${owner.attemptId}
      and ${campaign_queue.created_at} <= origin.created_at
      and coalesce(${campaign_queue.redial_requested_at}, ${campaign_queue.inserted_at}, ${campaign_queue.created_at}) <= origin.created_at
      and not exists (select 1 from public.outreach_attempt newer
        where newer.workspace = origin.workspace and newer.campaign_id = ${campaign_queue.campaign_id}
          and newer.contact_id = ${campaign_queue.contact_id} and newer.created_at > origin.created_at))`;
}

async function eligibleLegacyEntry(tdb: TenantDb, row: typeof campaign_queue.$inferSelect, owner: LegacyOwner) {
  const savedPrimary = row.id === owner.queueId && row.contact_id === owner.contactId;
  if (!savedPrimary && row.inserted_at === null && row.redial_requested_at === null) return false;
  if (row.voice_reservation_id || assignedElsewhere(row, owner.actorId)) return false;
  if (wasDequeued(row)) return true;
  if (row.queue_state !== null && !["queued", "assigned"].includes(row.queue_state)) return false;
  return !await hasLiveQueueCustomer(tdb, owner.campaignId, row.contact_id, owner.ignoredCallSids);
}

/** Saved IDs bind modern records; older unbound Calls also require the original outreach cutoff. */
export async function dequeueLegacyVoiceAttempt(workspaceId: string, callSid: string) {
  const publish: Array<() => Promise<void>> = [];
  const result = await db.transaction(async tx => {
    const [tenant] = await tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, workspaceId)).for("no key update");
    if (!tenant) return { ownedPrimary: false, removedCount: 0 };
    const tdb = createTenantDb(workspaceId, tx), owner = await readLegacyOwner(tdb, callSid);
    if (!owner) return { ownedPrimary: false, removedCount: 0 };
    const [subject, savedCampaign] = await Promise.all([
      tdb.contact.findFirst({ where: eq(contact.id, owner.contactId), columns: { household_id: true } }),
      tdb.campaign.findFirst({ where: eq(campaign.id, owner.campaignId), columns: { group_household_queue: true } }),
    ]);
    if (!subject || !savedCampaign) return { ownedPrimary: false, removedCount: 0 };
    const members = savedCampaign.group_household_queue && subject.household_id ? await tdb.contact.findMany({
      where: eq(contact.household_id, subject.household_id), columns: { id: true },
    }) : [{ id: owner.contactId }];
    const rows = await tx.select().from(campaign_queue).where(and(eq(campaign_queue.workspace, workspaceId),
      eq(campaign_queue.campaign_id, owner.campaignId), inArray(campaign_queue.contact_id, members.map(member => member.id)),
      belongsToLegacyAttempt(workspaceId, owner),
    )).orderBy(asc(campaign_queue.id)).for("no key update");
    const primary = rows.find(row => (owner.queueId === null || row.id === owner.queueId) && row.contact_id === owner.contactId);
    if (!primary || !await eligibleLegacyEntry(tdb, primary, owner)) return { ownedPrimary: false, removedCount: 0 };
    let removedCount = 0;
    for (const row of rows) {
      if (!await eligibleLegacyEntry(tdb, row, owner) || wasDequeued(row)) continue;
      const update = await dequeueQueueEntry({ by: { id: row.id }, userId: owner.actorId, workspaceId,
        expectedGeneration: row.dispatch_generation, reason: "Call completed", exec: tx, deferEmit: emit => publish.push(emit) });
      if (!update.dequeuedPrimary) throw new Error("The locked legacy queue entry changed during completion");
      removedCount++;
    }
    return { ownedPrimary: true, removedCount };
  });
  for (const emit of publish) {
    try { await emit(); } catch (error) { logger.error("voice_legacy.queue_event_failed", error); }
  }
  return result;
}
