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

import { isUniqueViolation } from "@/lib/parse-utils.server";

export { isUniqueViolation } from "@/lib/parse-utils.server";

/**
 * DB-backed idempotent insert for transaction_history.
 *
 * Uses a deterministic idempotency key stored in the transaction_history table
 * and enforced by a unique DB index/constraint.
 */
export async function insertTransactionHistoryIdempotent(args: {
  supabase: SupabaseClient<Database>;
  workspaceId: string;
  type: TransactionType;
  amount: number;
  note: string;
  idempotencyKey: string;
}): Promise<{ inserted: boolean; existingId?: number }> {
  const idempotencyKey = args.idempotencyKey.trim();
  if (!idempotencyKey) {
    throw new Error(
      "idempotencyKey is required for transaction history insert",
    );
  }

  try {
    const { data, error } = await args.supabase
      .from("transaction_history")
      .insert({
        workspace: args.workspaceId,
        type: args.type,
        amount: args.amount,
        note: args.note,
        idempotency_key: idempotencyKey,
      })
      .select("id")
      .single();

    if (!error) {
      logger.info("billing.transaction", {
        workspaceId: args.workspaceId,
        type: args.type,
        amount: args.amount,
        idempotencyKey,
        inserted: true,
        source: getBillingEventSource({
          type: args.type,
          idempotencyKey,
        }),
      });
      return { inserted: true, existingId: data?.id as number | undefined };
    }

    if (!isUniqueViolation(error)) {
      logger.error("transaction_history insert failed", {
        error,
        workspaceId: args.workspaceId,
        type: args.type,
        idempotencyKey,
      });
      throw error;
    }

    const { data: existing, error: existingError } = await args.supabase
      .from("transaction_history")
      .select("id")
      .eq("workspace", args.workspaceId)
      .eq("type", args.type)
      .eq("idempotency_key", idempotencyKey)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      logger.error("transaction_history duplicate lookup failed", {
        error: existingError,
        workspaceId: args.workspaceId,
        type: args.type,
        idempotencyKey,
      });
      throw existingError;
    }

    if (!existing?.id) {
      throw new Error(
        `transaction_history duplicate insert detected but existing row not found for key ${idempotencyKey}`,
      );
    }

    logger.info("billing.transaction", {
      workspaceId: args.workspaceId,
      type: args.type,
      amount: args.amount,
      idempotencyKey,
      inserted: false,
      source: getBillingEventSource({
        type: args.type,
        idempotencyKey,
      }),
    });
    return { inserted: false, existingId: existing.id };
  } catch (e) {
    logger.error("transaction_history idempotent insert error", e);
    throw e;
  }
}

