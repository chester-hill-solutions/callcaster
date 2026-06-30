import { sql } from "drizzle-orm";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { logger } from "@/lib/logger.server";
import {
  getBillingEventSource,
  getTransactionDisplayDescription,
  type TransactionType,
} from "@/lib/transaction-history-display";
import { db } from "@/server/db";

export type { TransactionType } from "@/lib/transaction-history-display";
export { getTransactionDisplayDescription } from "@/lib/transaction-history-display";
export {
  getBillingEventSource,
  getBillingEventSourceLabel,
  type BillingEventSource,
} from "@/lib/transaction-history-display";

type LedgerRpcRow = {
  id: number;
  inserted: boolean;
  amount: number;
  type: string;
  idempotency_key: string;
  workspace: string;
};

type InsertArgs = {
  workspaceId: string;
  type: TransactionType;
  amount: number;
  note: string;
  idempotencyKey: string;
  campaignId?: number | null;
  callSid?: string | null;
  messageSid?: string | null;
  /** Legacy path for Edge Functions and unit tests still on Supabase client. */
  supabase?: SupabaseClient<Database>;
};

async function applyLedgerEntryViaDrizzle(args: InsertArgs): Promise<LedgerRpcRow> {
  const idempotencyKey = args.idempotencyKey.trim();
  const result = await db.execute(sql`
    select id, inserted, amount, type, idempotency_key, workspace
    from apply_ledger_entry_and_sync_credits(
      ${args.workspaceId}::uuid,
      ${args.type},
      ${args.amount},
      ${idempotencyKey},
      ${args.note},
      ${args.campaignId ?? null},
      ${args.callSid ?? null},
      ${args.messageSid ?? null}
    )
  `);

  const row = (result[0] ?? null) as LedgerRpcRow | null;
  if (!row?.id) {
    throw new Error(
      `apply_ledger_entry_and_sync_credits returned no row for key ${idempotencyKey}`,
    );
  }
  return row;
}

async function applyLedgerEntryViaSupabase(args: InsertArgs): Promise<LedgerRpcRow> {
  const idempotencyKey = args.idempotencyKey.trim();
  const { data, error } = await args.supabase!.rpc(
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

  const row = data as LedgerRpcRow | null;
  if (!row?.id) {
    throw new Error(
      `apply_ledger_entry_and_sync_credits returned no row for key ${idempotencyKey}`,
    );
  }
  return row;
}

/**
 * DB-backed idempotent insert for transaction_history + atomic credits sync.
 */
export async function insertTransactionHistoryIdempotent(
  args: InsertArgs,
): Promise<{ inserted: boolean; existingId?: number }> {
  const idempotencyKey = args.idempotencyKey.trim();
  if (!idempotencyKey) {
    throw new Error(
      "idempotencyKey is required for transaction history insert",
    );
  }

  try {
    const row = args.supabase
      ? await applyLedgerEntryViaSupabase(args)
      : await applyLedgerEntryViaDrizzle(args);

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
