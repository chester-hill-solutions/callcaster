import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { logger } from "@/lib/logger.server";

export type TransactionType = "DEBIT" | "CREDIT";

const transactionHistoryInsertLocks = new Map<string, Promise<void>>();

async function withTransactionHistoryInsertLock<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = transactionHistoryInsertLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  transactionHistoryInsertLocks.set(key, queued);

  await previous;

  try {
    return await fn();
  } finally {
    release();
    if (transactionHistoryInsertLocks.get(key) === queued) {
      transactionHistoryInsertLocks.delete(key);
    }
  }
}

/**
 * Best-effort idempotent insert for transaction_history.
 *
 * Twilio webhooks can be delivered more than once, and we currently have multiple
 * handlers that can record billing. Until we have a DB-level unique constraint,
 * we prevent duplicates by embedding an idempotency marker in `note` and
 * checking for an existing row before insert.
 */
export async function insertTransactionHistoryIdempotent(args: {
  supabase: SupabaseClient<Database>;
  workspaceId: string;
  type: TransactionType;
  amount: number;
  note: string;
  idempotencyKey: string;
}): Promise<{ inserted: boolean; existingId?: number }> {
  const marker = `[idempotency:${args.idempotencyKey}]`;
  const noteWithMarker = args.note.includes(marker)
    ? args.note
    : `${args.note} ${marker}`;

  return withTransactionHistoryInsertLock(
    `${args.workspaceId}:${args.type}:${args.idempotencyKey}`,
    async () => {
      try {
        const { data: existing, error: existingError } = await args.supabase
          .from("transaction_history")
          .select("id")
          .eq("workspace", args.workspaceId)
          .eq("type", args.type)
          .like("note", `%${marker}%`)
          .order("created_at", { ascending: false })
          .limit(1);

        if (!existingError && existing && existing.length > 0) {
          return {
            inserted: false,
            existingId: existing[0]?.id as number | undefined,
          };
        }

        const { data, error } = await args.supabase
          .from("transaction_history")
          .insert({
            workspace: args.workspaceId,
            type: args.type,
            amount: args.amount,
            note: noteWithMarker,
          })
          .select("id")
          .single();

        if (error) {
          logger.error("transaction_history insert failed", { error, noteWithMarker });
          throw error;
        }

        return { inserted: true, existingId: data?.id as number | undefined };
      } catch (e) {
        logger.error("transaction_history idempotent insert error", e);
        throw e;
      }
    },
  );
}

