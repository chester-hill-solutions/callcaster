import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { call, campaign_queue, workspace, workspace_voice_reservation as reservations } from "@/db/schema";
import { isTerminalStatus, normalizeProviderStatus } from "@/lib/call-status";
import { buildQueuedQueueUpdate } from "@/lib/queue-status";
import { updateCampaignQueueAndEmit } from "@/lib/campaign-queue-db.server";
import { logger } from "@/lib/logger.server";
import { db } from "./db";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import type { VoiceReservation } from "./voice-credit-reservation.server";
import { dialerReservationIsStopped } from "./voice-dialer-intent.server";

export type HumanAdmissionEvents = Array<() => Promise<void>>;

/** Callers hold the workspace fence before reading or changing human ownership. */
export async function findBusyPredictiveHuman(tx: CreditTransaction, workspaceId: string, userId: string, exceptId?: string) {
  const [busy] = await tx.select({ id: reservations.id }).from(reservations).where(and(
    eq(reservations.workspace, workspaceId), eq(reservations.user_id, userId),
    inArray(reservations.human_state, ["pending", "joined"]), exceptId ? ne(reservations.id, exceptId) : undefined,
  )).limit(1);
  return busy ?? null;
}

export function matchesFundedHumanCall(current: typeof call.$inferSelect, owner: VoiceReservation) {
  return current.sid === owner.provider_sid && current.workspace === owner.workspace &&
    current.account_sid === owner.account_sid && current.user_id === owner.user_id &&
    current.campaign_id === owner.campaign_id && current.contact_id === owner.contact_id &&
    current.outreach_attempt_id === owner.outreach_attempt_id &&
    (!current.conference_id || current.conference_id === owner.conference_id);
}

/** Requeue only this rejected attempt. Its late callbacks retain the old generation. */
async function refuseExtraHuman(tx: CreditTransaction, owner: VoiceReservation, publish: HumanAdmissionEvents) {
  await tx.update(reservations).set({ human_state: "refused", updated_at: new Date() }).where(eq(reservations.id, owner.id));
  if (owner.queue_id == null || !owner.queue_generation || owner.campaign_id == null || owner.contact_id == null) return;
  await updateCampaignQueueAndEmit({
    conditions: [eq(campaign_queue.id, owner.queue_id), eq(campaign_queue.workspace, owner.workspace),
      eq(campaign_queue.campaign_id, owner.campaign_id), eq(campaign_queue.contact_id, owner.contact_id),
      eq(campaign_queue.dispatch_generation, owner.queue_generation), eq(campaign_queue.voice_reservation_id, owner.id)],
    set: { ...buildQueuedQueueUpdate(), dispatch_generation: sql`gen_random_uuid()`, voice_reservation_id: null,
      redial_requested_at: sql`clock_timestamp()` },
    workspaceId: owner.workspace, exec: tx, deferEmit: emit => publish.push(emit),
  });
}

/** The caller holds workspace and fresh reservation locks through instruction commit. */
export async function claimPredictiveHumanInTransaction(tx: CreditTransaction, owner: VoiceReservation, publish: HumanAdmissionEvents) {
  if (await dialerReservationIsStopped(tx, owner)) return false;
  if (owner.kind !== "staffed" || !owner.user_id || !owner.provider_sid || !owner.conference_id || owner.human_state ||
    ["released", "settled"].includes(owner.state) || owner.terminal_status) return false;
  const [current] = await tx.select().from(call).where(and(eq(call.workspace, owner.workspace), eq(call.sid, owner.provider_sid))).for("update");
  if (!current || !matchesFundedHumanCall(current, owner) || isTerminalStatus(normalizeProviderStatus(current.status))) return false;
  if (await findBusyPredictiveHuman(tx, owner.workspace, owner.user_id, owner.id)) {
    await refuseExtraHuman(tx, owner, publish);
    return false;
  }
  await tx.update(reservations).set({ human_state: "pending", updated_at: new Date() }).where(eq(reservations.id, owner.id));
  return true;
}

export async function publishHumanAdmissionEvents(publish: HumanAdmissionEvents) {
  for (const emit of publish) {
    try { await emit(); } catch (error) { logger.error("predictive.human_queue_event_failed", error); }
  }
}

/** Legacy funded browser customers use the same owner as confirmed-phone customers. */
export async function claimPredictiveHumanInstruction(owner: VoiceReservation) {
  const publish: HumanAdmissionEvents = [];
  const admitted = await db.transaction(async tx => {
    await tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, owner.workspace)).for("no key update");
    const [current] = await tx.select().from(reservations).where(and(eq(reservations.id, owner.id), eq(reservations.workspace, owner.workspace))).for("update");
    if (!current || current.provider_sid !== owner.provider_sid || current.account_sid !== owner.account_sid) return false;
    return claimPredictiveHumanInTransaction(tx, current, publish);
  });
  await publishHumanAdmissionEvents(publish);
  return admitted;
}
