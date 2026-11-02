import { and, eq } from "drizzle-orm";
import { campaign, campaign_queue } from "@/db/schema";
import { db } from "@/server/db";
import { createTenantDb } from "@/server/tenant-db";
import { rpcDequeueContact } from "@/lib/db-rpc.server";
import { tryCompleteDrainedCampaigns } from "@/lib/campaign-queue-completion.server";
import { logger } from "@/lib/logger.server";
import type { VoiceReservation } from "./voice-credit-reservation.server";

/** A late result cannot advance a later manual intent in the same generation. */
export async function dequeueFundedVoiceAttempt(reservation: VoiceReservation) {
  const { queue_id: queueId, queue_generation: generation, campaign_id: campaignId, contact_id: contactId } = reservation;
  if (queueId == null || !generation || campaignId == null || contactId == null) return;
  const publish: Array<() => Promise<void>> = [];
  await db.transaction(async (tx) => {
    const [queue] = await tx.select().from(campaign_queue).where(and(
      eq(campaign_queue.id, queueId), eq(campaign_queue.workspace, reservation.workspace),
      eq(campaign_queue.dispatch_generation, generation), eq(campaign_queue.voice_reservation_id, reservation.id),
      eq(campaign_queue.campaign_id, campaignId), eq(campaign_queue.contact_id, contactId),
    ));
    if (!queue) return;
    const tdb = createTenantDb(reservation.workspace, tx);
    const savedCampaign = await tdb.campaign.findFirst({ where: eq(campaign.id, queue.campaign_id), columns: { group_household_queue: true } });
    await rpcDequeueContact(tdb, { workspaceId: reservation.workspace, campaignId: queue.campaign_id,
      contactId: queue.contact_id,
      groupOnHousehold: savedCampaign?.group_household_queue ?? false, dequeuedReasonText: "Call completed",
      voiceReservationId: reservation.id, readDb: tx, deferEmit: (emit) => publish.push(emit) });
  });
  for (const emit of publish) {
    try { await emit(); }
    catch (error) { logger.error("voice_credit.queue_event_failed", error); }
  }
  await tryCompleteDrainedCampaigns([campaignId], createTenantDb(reservation.workspace), reservation.workspace);
}
