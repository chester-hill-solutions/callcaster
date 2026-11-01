import { and, eq } from "drizzle-orm";
import { call, campaign_queue, workspace_voice_reservation } from "@/db/schema";
import { db } from "./db";
import { lockVoiceWorkspaceMember } from "./voice-workspace-member.server";
import { isTerminalStatus, normalizeProviderStatus } from "@/lib/call-status";
import { rpcDequeueContact } from "@/lib/db-rpc.server";
import { tryCompleteDrainedCampaigns } from "@/lib/campaign-queue-completion.server";
import { createTenantDb } from "./tenant-db";
import { logger } from "@/lib/logger.server";
import type { QueueAdvanceRequest } from "@/lib/schemas/api/queue-advance";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import type { VoiceReservation } from "./voice-credit-reservation.server";

const conflict = () => ({ ok: false as const, reason: "queue_changed" as const });
function confirmed(advance_state: "dequeued" | "already_dequeued" | "superseded") {
  return { ok: true as const, dequeued: advance_state === "dequeued", advance_state };
}
function changedQueue(request: QueueAdvanceRequest) {
  return request.call_sid ? confirmed("superseded") : conflict();
}

async function readCompletedCustomer(tx: CreditTransaction, request: QueueAdvanceRequest, userId: string) {
  if (!request.call_sid) return { ok: true as const, reservation: null };
  const [customer] = await tx.select().from(call).where(and(eq(call.workspace, request.workspace_id), eq(call.sid, request.call_sid)));
  if (!customer || customer.user_id !== userId || customer.campaign_id !== request.campaign_id ||
    customer.contact_id !== request.contact_id || !isTerminalStatus(normalizeProviderStatus(customer.status))) return conflict();
  const [reservation] = await tx.select().from(workspace_voice_reservation).where(and(
    eq(workspace_voice_reservation.workspace, request.workspace_id), eq(workspace_voice_reservation.provider_sid, request.call_sid),
  ));
  if (reservation && (reservation.user_id !== userId || reservation.campaign_id !== request.campaign_id ||
    reservation.contact_id !== request.contact_id || reservation.account_sid !== customer.account_sid ||
    reservation.outreach_attempt_id !== customer.outreach_attempt_id)) return conflict();
  return { ok: true as const, reservation: reservation ?? null };
}

function ownsFundedQueue(reservation: VoiceReservation, row: typeof campaign_queue.$inferSelect, request: QueueAdvanceRequest) {
  return reservation.queue_id === row.id && reservation.queue_generation === request.dispatch_generation &&
    row.voice_reservation_id === reservation.id;
}

export async function advanceCallScreenQueue(request: QueueAdvanceRequest, userId: string) {
  const publish: Array<() => Promise<void>> = [];
  const result = await db.transaction(async tx => {
    const member = await lockVoiceWorkspaceMember(tx, { workspaceId: request.workspace_id, userId });
    if (!member.ok) return { ok: false as const, reason: "not_found" as const };
    const subject = await readCompletedCustomer(tx, request, userId);
    if (!subject.ok) return subject;
    // A legacy call has no saved queue generation. Retire its completed view without changing queue work.
    if (request.call_sid && !subject.reservation) return confirmed("superseded");
    const [row] = await tx.select().from(campaign_queue).where(and(
      eq(campaign_queue.workspace, request.workspace_id), eq(campaign_queue.id, request.queue_id),
      eq(campaign_queue.campaign_id, request.campaign_id), eq(campaign_queue.contact_id, request.contact_id),
    )).for("no key update");
    if (!row || row.dispatch_generation !== request.dispatch_generation) return changedQueue(request);
    if (subject.reservation && !ownsFundedQueue(subject.reservation, row, request)) return confirmed("superseded");
    if (row.dequeued_at || row.queue_state === "dequeued") return confirmed("already_dequeued");
    if (row.voice_reservation_id !== (subject.reservation?.id ?? null)) return changedQueue(request);
    if (row.queue_state === "assigned" && row.assigned_to_user_id !== userId)
      return request.call_sid ? confirmed("superseded") : { ok: false as const, reason: "assigned_elsewhere" as const };
    const count = await rpcDequeueContact(member.tdb, {
      workspaceId: request.workspace_id, contactId: request.contact_id, campaignId: request.campaign_id,
      groupOnHousehold: request.household, dequeuedById: userId, dequeuedReasonText: "Manually dequeued by user",
      voiceReservationId: subject.reservation?.id, readDb: tx, deferEmit: emit => publish.push(emit),
    });
    return count > 0 ? confirmed("dequeued") : changedQueue(request);
  });
  for (const emit of publish) {
    try { await emit(); } catch (error) { logger.error("queue.advance_event_failed", error); }
  }
  if (result.ok && result.advance_state !== "superseded") await tryCompleteDrainedCampaigns([request.campaign_id],
    createTenantDb(request.workspace_id), request.workspace_id);
  return result;
}
