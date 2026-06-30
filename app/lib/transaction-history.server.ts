import { sql } from "drizzle-orm";
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
    const row = await applyLedgerEntryViaDrizzle(args);

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
