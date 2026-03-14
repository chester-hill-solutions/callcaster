import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { logger } from "@/lib/logger.server";

export type TransactionType = "DEBIT" | "CREDIT";

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code === "23505";
}

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

    return { inserted: false, existingId: existing.id };
  } catch (e) {
    logger.error("transaction_history idempotent insert error", e);
    throw e;
  }
}

export function getTransactionDisplayDescription(args: {
  type: TransactionType;
  amount: number;
  note?: string | null;
}): string {
  const rawNote = args.note ?? "";
  const withoutMarker = rawNote
    .replace(/\s*\[idempotency:[^\]]+\]\s*/g, " ")
    .trim();
  const withoutStripeSession = withoutMarker
    .replace(/,?\s*stripe_session:[^\s,]+/g, "")
    .trim();

  if (withoutStripeSession) {
    return withoutStripeSession;
  }

  if (args.type === "CREDIT") {
    return `Added ${args.amount} credits`;
  }

  return `Used ${args.amount} credits`;
}
