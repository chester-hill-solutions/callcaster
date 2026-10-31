import { and, eq } from "drizzle-orm";
import { call, campaign_queue, outreach_attempt, workspace, workspace_voice_reservation as reservations } from "@/db/schema";
import { isTerminalStatus, normalizeProviderStatus } from "@/lib/call-status";
import { updateCampaignQueueAndEmit } from "@/lib/campaign-queue-db.server";
import { buildProviderStatusQueueUpdate } from "@/lib/queue-status";
import type { ParticipantJoinEvent } from "@/lib/twilio/voice-callback";
import { db } from "./db";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import type { VoiceReservation } from "./voice-credit-reservation.server";
import { matchesFundedHumanCall } from "./predictive-human-admission.server";
import { observePredictiveHumanPresence } from "./predictive-human-presence.server";

async function lockJoin(tx: CreditTransaction, owner: VoiceReservation, event: ParticipantJoinEvent) {
  await tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, owner.workspace)).for("no key update");
  const [reservation] = await tx.select().from(reservations).where(and(
    eq(reservations.id, owner.id), eq(reservations.workspace, owner.workspace),
  )).for("update");
  if (!reservation || !reservation.provider_sid || !reservation.conference_id || reservation.provider_sid !== event.callSid || reservation.kind !== "staffed" ||
    reservation.account_sid !== event.accountSid || reservation.conference_id !== event.conferenceRef ||
    ["released", "settled"].includes(reservation.state) || isTerminalStatus(normalizeProviderStatus(reservation.terminal_status))) return null;
  const [current] = await tx.select().from(call).where(and(
    eq(call.workspace, owner.workspace), eq(call.sid, reservation.provider_sid),
  )).for("update");
  if (!current || !matchesFundedHumanCall(current, reservation) || isTerminalStatus(normalizeProviderStatus(current.status))) return null;
  return { reservation, current };
}

/** Keep answer facts and the owned queue write atomic; publish only after commit. */
export async function recordFundedPredictiveJoin(owner: VoiceReservation, event: ParticipantJoinEvent) {
  const publish: Array<() => Promise<void>> = [];
  const current = await db.transaction(async tx => {
    const joined = await lockJoin(tx, owner, event);
    if (!joined) return null;
    const { reservation, current } = joined;
    if (!await observePredictiveHumanPresence(tx, reservation, event)) return null;
    if (!current.outreach_attempt_id || !current.campaign_id || !current.contact_id) return null;
    const [attempt] = await tx.select().from(outreach_attempt).where(and(
      eq(outreach_attempt.workspace, owner.workspace), eq(outreach_attempt.id, current.outreach_attempt_id),
      eq(outreach_attempt.campaign_id, current.campaign_id), eq(outreach_attempt.contact_id, current.contact_id),
    )).for("update");
    if (!attempt) throw new Error("Funded predictive customer outreach is missing");
    if (!current.conference_id) {
      if (!event.timestamp) throw new Error("Missing predictive participant timestamp");
      await tx.update(call).set({ conference_id: reservation.conference_id, start_time: new Date(event.timestamp) })
        .where(and(eq(call.workspace, owner.workspace), eq(call.sid, current.sid)));
    }
    if (!attempt.answered_at) await tx.update(outreach_attempt).set({ answered_at: new Date().toISOString() })
      .where(and(eq(outreach_attempt.workspace, owner.workspace), eq(outreach_attempt.id, attempt.id)));
    if (reservation.queue_id != null && reservation.queue_generation) await updateCampaignQueueAndEmit({
      conditions: [eq(campaign_queue.id, reservation.queue_id), eq(campaign_queue.workspace, owner.workspace),
        eq(campaign_queue.campaign_id, current.campaign_id), eq(campaign_queue.contact_id, current.contact_id),
        eq(campaign_queue.dispatch_generation, reservation.queue_generation), eq(campaign_queue.voice_reservation_id, reservation.id)],
      set: buildProviderStatusQueueUpdate("in-progress"), workspaceId: owner.workspace, exec: tx,
      deferEmit: emit => publish.push(emit),
    });
    return { ...current, conference_id: reservation.conference_id };
  });
  for (const emit of publish) await emit();
  return current;
}
