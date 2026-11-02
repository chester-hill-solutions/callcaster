import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { predictive_machine_operation as operations, workspace_voice_reservation as reservations } from "@/db/schema";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import type { VoiceReservation } from "./voice-credit-reservation.server";
import { db } from "@/server/db";
export class PredictiveContinuationStoppedError extends Error {}

export async function ensureFundedPredictiveReceipt(reservation: VoiceReservation) {
  if (!reservation.predictive_operation_id || !reservation.provider_sid) return;
  const sid = reservation.provider_sid;
  await db.transaction((tx) => recordFundedPredictiveReceipt(tx, reservation, sid));
}

export async function findPredictiveVoiceReservation(workspaceId: string, operationId: string) {
  const [reservation] = await db.select().from(reservations).where(and(
    eq(reservations.workspace, workspaceId), eq(reservations.predictive_operation_id, operationId),
    ne(reservations.state, "released"),
  )).limit(1);
  return reservation ?? null;
}

export async function recordFundedPredictiveTerminalReceipt(tx: CreditTransaction, reservation: VoiceReservation, sid: string, status: string) {
  if (!reservation.predictive_operation_id) return;
  await recordFundedPredictiveReceipt(tx, reservation, sid);
  await tx.update(operations).set({ successor_callback_sid: sid, successor_callback_status: status, updated_at: new Date() })
    .where(and(eq(operations.workspace, reservation.workspace), eq(operations.id, reservation.predictive_operation_id),
      isNull(operations.successor_callback_sid)));
}

/** Keep the existing continuation journal beside the financial acceptance. */
export async function recordFundedPredictiveReceipt(tx: CreditTransaction, reservation: VoiceReservation, sid: string) {
  if (!reservation.predictive_operation_id) return;
  const [saved] = await tx.update(operations).set({ successor_call_sid: sid, updated_at: new Date() }).where(and(
    eq(operations.workspace, reservation.workspace), eq(operations.id, reservation.predictive_operation_id),
    eq(operations.successor_attempt_id, reservation.outreach_attempt_id ?? 0),
    eq(operations.successor_queue_id, reservation.queue_id ?? 0), eq(operations.successor_contact_id, reservation.contact_id ?? 0),
    eq(operations.successor_voice_url, reservation.voice_url ?? ""), eq(operations.successor_status_url, reservation.status_callback ?? ""),
    inArray(operations.state, ["continuing", "continued", "uncertain"]),
    or(isNull(operations.successor_call_sid), eq(operations.successor_call_sid, sid)),
    or(isNull(operations.successor_callback_sid), eq(operations.successor_callback_sid, sid)),
  )).returning({ id: operations.id });
  if (!saved) throw new Error("Funded predictive acceptance does not match its continuation");
}
