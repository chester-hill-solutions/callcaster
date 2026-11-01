import { and, asc, eq, inArray } from "drizzle-orm";
import { call, campaign_queue, contact, workspace_voice_reservation } from "@/db/schema";
import { db } from "./db";
import { lockVoiceWorkspaceMember } from "./voice-workspace-member.server";
import { isTerminalStatus, normalizeProviderStatus } from "@/lib/call-status";
import { dequeueQueueEntry } from "@/lib/campaign-queue-db.server";
import { logger } from "@/lib/logger.server";
import { assignedElsewhere, eligibleHouseholdSibling, hasLiveQueueCustomer, matchesAdvanceEntry, wasDequeued } from "./queue-advance-ownership.server";
import type { QueueAdvanceRequest, QueueRemovedEntry } from "@/lib/schemas/api/queue-advance";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import type { VoiceReservation } from "./voice-credit-reservation.server";

const conflict = () => ({ ok: false as const, reason: "queue_changed" as const });
function confirmed(advance_state: "dequeued" | "already_dequeued" | "superseded", removed_entries: QueueRemovedEntry[] = []) {
  return { ok: true as const, dequeued: advance_state === "dequeued", advance_state, removed_entries };
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
    // Completing queue work remains available when outbound calling is disabled.
    const member = await lockVoiceWorkspaceMember(tx, { workspaceId: request.workspace_id, userId }, true);
    if (!member.ok) return { ok: false as const, reason: "not_found" as const };
    const subject = await readCompletedCustomer(tx, request, userId);
    if (!subject.ok) return subject;
    // A legacy call has no saved queue generation. Retire its completed view without changing queue work.
    if (request.call_sid && !subject.reservation) return confirmed("superseded");
    const captured = [request, ...(request.household_snapshot?.entries ?? [])];
    const rows = await tx.select().from(campaign_queue).where(and(
      eq(campaign_queue.workspace, request.workspace_id), eq(campaign_queue.campaign_id, request.campaign_id),
      inArray(campaign_queue.id, captured.map(entry => entry.queue_id)),
    )).orderBy(asc(campaign_queue.id)).for("no key update");
    const row = rows.find(candidate => candidate.id === request.queue_id);
    if (!row || !matchesAdvanceEntry(row, request)) return changedQueue(request);
    if (subject.reservation && !ownsFundedQueue(subject.reservation, row, request)) return confirmed("superseded");
    if (assignedElsewhere(row, userId)) return request.call_sid ? confirmed("superseded") : { ok: false as const, reason: "assigned_elsewhere" as const };
    const primary = await member.tdb.contact.findFirst({ where: eq(contact.id, request.contact_id), columns: { household_id: true } });
    if (request.household && primary?.household_id !== request.household_snapshot?.household_id) return conflict();
    const alreadyDequeued = wasDequeued(row);
    if (!alreadyDequeued && (await hasLiveQueueCustomer(member.tdb, request.campaign_id, request.contact_id) ||
      row.voice_reservation_id !== (subject.reservation?.id ?? null) ||
      (row.queue_state !== null && !["queued", "assigned"].includes(row.queue_state)))) return conflict();
    const removed: QueueRemovedEntry[] = [];
    const remove = async (candidate: typeof row) => {
      if (!wasDequeued(candidate)) {
        const result = await dequeueQueueEntry({ by: { id: candidate.id }, userId, reason: "Manually dequeued by user",
          workspaceId: request.workspace_id, expectedGeneration: candidate.dispatch_generation, exec: tx, deferEmit: emit => publish.push(emit) });
        if (!result.dequeuedPrimary) throw new Error("The locked queue entry changed during advance");
      }
      removed.push({ queue_id: candidate.id, contact_id: candidate.contact_id, dispatch_generation: candidate.dispatch_generation,
        voice_reservation_id: candidate.voice_reservation_id });
    };
    await remove(row);
    for (const entry of request.household_snapshot?.entries ?? []) {
      const sibling = rows.find(candidate => candidate.id === entry.queue_id);
      if (sibling && await eligibleHouseholdSibling(member.tdb, sibling, entry, request, userId, subject.reservation)) await remove(sibling);
    }
    return confirmed(alreadyDequeued ? "already_dequeued" : "dequeued", removed);
  });
  for (const emit of publish) {
    try { await emit(); } catch (error) { logger.error("queue.advance_event_failed", error); }
  }
  return result;
}
