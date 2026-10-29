import { and, eq, or } from "drizzle-orm";
import { workspace_voice_reservation as reservations } from "@/db/schema";
import { db } from "@/server/db";
import { callKey } from "@/lib/billing-keys";
import { debitAmountFromCredits, TERMINAL_BILLABLE_CALL_STATUSES, voiceCreditsFromDurationSeconds } from "@/lib/pricing";
import { insertTransactionHistoryIdempotent } from "@/lib/transaction-history.server";
import { emitTransactionHistoryInsertEvent } from "@/lib/workspace-events.server";
import { logger } from "@/lib/logger.server";

const TERMINAL_STATUSES = new Set<string>([...TERMINAL_BILLABLE_CALL_STATUSES, "canceled"]);

export async function settleVoiceReservation(args: {
  workspaceId: string;
  callSid: string;
  status: string;
  duration: number;
  note: string;
}) {
  const result = await db.transaction(async (tx) => {
    // Hold ownership serializes duplicate callbacks. The ledger then acquires
    // the workspace lock in its normal order, including for legacy callers.
    const [reservation] = await tx.select().from(reservations).where(and(
      eq(reservations.workspace, args.workspaceId),
      or(eq(reservations.provider_sid, args.callSid), eq(reservations.setup_sid, args.callSid)),
    )).for("update");
    if (!reservation) return { handled: false as const, billingResult: null };
    if (reservation.provider_sid !== args.callSid || !TERMINAL_STATUSES.has(args.status)) {
      return { handled: true as const, billingResult: null };
    }
    const billable = args.status !== "canceled" && Number.isFinite(args.duration) && args.duration > 0;
    const amount = billable ? debitAmountFromCredits(voiceCreditsFromDurationSeconds(args.duration, reservation.kind)) : 0;
    const billingResult = billable ? await insertTransactionHistoryIdempotent(tx, {
      workspaceId: args.workspaceId, type: "DEBIT", amount, note: args.note,
      idempotencyKey: callKey(args.callSid), callSid: args.callSid,
      campaignId: reservation.campaign_id, emitEvent: false,
    }) : null;
    await tx.update(reservations).set({ state: "settled", updated_at: new Date(), last_error: null })
      .where(eq(reservations.id, reservation.id));
    return { handled: true as const, billingResult, amount };
  });
  if (result.billingResult?.inserted && result.billingResult.existingId) {
    try {
      await emitTransactionHistoryInsertEvent(args.workspaceId, {
        id: result.billingResult.existingId, workspace: args.workspaceId,
        type: "DEBIT", amount: result.amount, idempotency_key: callKey(args.callSid),
      });
    } catch (error) {
      logger.error("Voice reservation ledger event failed", error);
    }
  }
  return result;
}
