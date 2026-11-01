import { and, eq, inArray } from "drizzle-orm";
import { call, campaign_queue, contact, workspace_voice_audio_connection as connections, workspace_voice_reservation as reservations } from "@/db/schema";
import { isTerminalStatus, normalizeProviderStatus } from "@/lib/call-status";
import { getAssignedUserId } from "@/lib/queue-status";
import type { QueueAdvanceEntry, QueueAdvanceRequest } from "@/lib/schemas/api/queue-advance";
import type { TenantDb } from "./tenant-db";
import type { VoiceReservation } from "./voice-credit-reservation.server";

export type AdvanceRow = typeof campaign_queue.$inferSelect;
export const wasDequeued = (row: AdvanceRow) => Boolean(row.dequeued_at || row.queue_state === "dequeued");
export const matchesAdvanceEntry = (row: AdvanceRow, entry: QueueAdvanceEntry) => row.id === entry.queue_id &&
  row.contact_id === entry.contact_id && row.dispatch_generation === entry.dispatch_generation && row.voice_reservation_id === entry.voice_reservation_id;
const isAdvanceable = (row: AdvanceRow) => row.queue_state === null || ["queued", "assigned"].includes(row.queue_state);
export const assignedElsewhere = (row: AdvanceRow, userId: string) => {
  const assigned = getAssignedUserId(row);
  return assigned !== null && assigned !== userId;
};

/** Unknown customer status remains live. Saved audio/setup legs are not customer work. */
export async function hasLiveQueueCustomer(tdb: TenantDb, campaignId: number, contactId: number) {
  const customers = await tdb.call.findMany({ where: and(eq(call.campaign_id, campaignId), eq(call.contact_id, contactId)),
    columns: { sid: true, account_sid: true, status: true } });
  const pending = customers.filter(customer => !isTerminalStatus(normalizeProviderStatus(customer.status)));
  if (!pending.length) return false;
  const sids = pending.map(customer => customer.sid);
  const audio = await tdb.workspace_voice_audio_connection.findMany({ where: inArray(connections.provider_sid, sids),
    columns: { provider_sid: true, account_sid: true } });
  const setup = await tdb.workspace_voice_reservation.findMany({ where: inArray(reservations.setup_sid, sids),
    columns: { setup_sid: true, account_sid: true } });
  return pending.some(customer => !audio.some(leg => leg.provider_sid === customer.sid && leg.account_sid === customer.account_sid) &&
    !setup.some(leg => leg.setup_sid === customer.sid && leg.account_sid === customer.account_sid));
}

export async function eligibleHouseholdSibling({ tdb, row, entry, request, userId, primaryReservation }: {
  tdb: TenantDb; row: AdvanceRow; entry: QueueAdvanceEntry; request: QueueAdvanceRequest; userId: string; primaryReservation: VoiceReservation | null;
}) {
  if (!matchesAdvanceEntry(row, entry) || assignedElsewhere(row, userId)) return false;
  const member = await tdb.contact.findFirst({ where: eq(contact.id, row.contact_id), columns: { household_id: true } });
  if (!request.household_snapshot?.household_id || member?.household_id !== request.household_snapshot.household_id) return false;
  if (primaryReservation && (row.created_at > primaryReservation.created_at ||
    (row.redial_requested_at && row.redial_requested_at > primaryReservation.created_at))) return false;
  if (wasDequeued(row)) return true;
  if (!isAdvanceable(row)) return false;
  if (await hasLiveQueueCustomer(tdb, request.campaign_id, row.contact_id)) return false;
  if (!row.voice_reservation_id) return true;
  const owner = await tdb.workspace_voice_reservation.findFirst({ where: eq(reservations.id, row.voice_reservation_id) });
  return Boolean(owner && ["settled", "released"].includes(owner.state) &&
    (!primaryReservation || owner.created_at <= primaryReservation.created_at));
}

/** Validate the primary before any household row can change. */
export async function validatePrimaryAdvance({ tdb, row, request, userId, reservation }: {
  tdb: TenantDb; row: AdvanceRow | undefined; request: QueueAdvanceRequest; userId: string; reservation: VoiceReservation | null;
}) {
  if (!row || !matchesAdvanceEntry(row, request)) return request.call_sid ? "superseded" : "queue_changed";
  if (reservation && (reservation.queue_id !== row.id || reservation.queue_generation !== request.dispatch_generation ||
    reservation.id !== request.voice_reservation_id)) return "superseded";
  if (assignedElsewhere(row, userId)) return request.call_sid ? "superseded" : "assigned_elsewhere";
  const primary = await tdb.contact.findFirst({ where: eq(contact.id, request.contact_id), columns: { household_id: true } });
  if (request.household && primary?.household_id !== request.household_snapshot?.household_id) return "queue_changed";
  if (wasDequeued(row)) return "already_dequeued";
  if (await hasLiveQueueCustomer(tdb, request.campaign_id, request.contact_id) ||
    row.voice_reservation_id !== (reservation?.id ?? null) ||
    !isAdvanceable(row)) return "queue_changed";
  return "ready";
}
