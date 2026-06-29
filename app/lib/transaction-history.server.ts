import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { logger } from "@/lib/logger.server";
import {
  getBillingEventSource,
  getTransactionDisplayDescription,
  type TransactionType,
} from "@/lib/transaction-history-display";

export type { TransactionType } from "@/lib/transaction-history-display";
export { getTransactionDisplayDescription } from "@/lib/transaction-history-display";
export {
  getBillingEventSource,
  getBillingEventSourceLabel,
  type BillingEventSource,
} from "@/lib/transaction-history-display";

/**
 * DB-backed idempotent insert for transaction_history + atomic credits sync.
 *
 * Calls the `apply_ledger_entry_and_sync_credits` plpgsql RPC which does
 * `INSERT ... ON CONFLICT DO NOTHING` + `UPDATE workspace SET credits` in a
 * single atomic transaction. Replaces the banned Postgres trigger (ADR-0006).
 */
export async function insertTransactionHistoryIdempotent(args: {
  supabase: SupabaseClient<Database>;
  workspaceId: string;
  type: TransactionType;
  amount: number;
  note: string;
  idempotencyKey: string;
  campaignId?: number | null;
  callSid?: string | null;
  messageSid?: string | null;
}): Promise<{ inserted: boolean; existingId?: number }> {
  const idempotencyKey = args.idempotencyKey.trim();
  if (!idempotencyKey) {
    throw new Error(
      "idempotencyKey is required for transaction history insert",
    );
  }

  try {
    const { data, error } = await args.supabase.rpc(
      "apply_ledger_entry_and_sync_credits",
      {
        p_workspace_id: args.workspaceId,
        p_type: args.type,
        p_amount: args.amount,
        p_idempotency_key: idempotencyKey,
        p_description: args.note,
        p_campaign_id: args.campaignId ?? null,
        p_call_sid: args.callSid ?? null,
        p_message_sid: args.messageSid ?? null,
      },
    );

    if (error) {
      logger.error("transaction_history RPC failed", {
        error,
        workspaceId: args.workspaceId,
        type: args.type,
        amount: args.amount,
        idempotencyKey,
      });
      throw error;
    }

    const row = data as
      | { id: number; inserted: boolean }
      | null;

    if (!row?.id) {
      throw new Error(
        `apply_ledger_entry_and_sync_credits returned no row for key ${idempotencyKey}`,
      );
    }

    logger.info("billing.transaction", {
      workspaceId: args.workspaceId,
      type: args.type,
      amount: args.amount,
      idempotencyKey,
      inserted: row.inserted,
      source: getBillingEventSource({
        type: args.type,
        idempotencyKey,
      }),
    });

    return { inserted: row.inserted, existingId: row.id };
  } catch (e) {
    logger.error("transaction_history idempotent insert error", e);
    throw e;
  }
}
