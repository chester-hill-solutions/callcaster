import { vi } from "vitest";

export type TransactionRow = {
  id: number;
  workspace: string;
  type: "DEBIT" | "CREDIT";
  amount: number;
  note: string;
  idempotency_key?: string;
  created_at: string;
};

export function uniqueViolationError(message = "duplicate"): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = "23505";
  return error;
}

/**
 * Supabase `rpc("apply_ledger_entry_and_sync_credits", ...)` stub.
 * Simulates the plpgsql RPC: idempotent insert with `inserted` flag.
 * Shares the same in-memory row array as `makeTransactionHistoryTableStub`
 * so tests can inspect results via `_transactionRows`.
 */
export function makeApplyLedgerEntryRpcStub(transactionRows: TransactionRow[]) {
  let nextId = 1;
  return async (
    fn: string,
    args: {
      p_workspace_id: string;
      p_type: string;
      p_amount: number;
      p_idempotency_key: string;
      p_description?: string | null;
      p_campaign_id?: number | null;
      p_call_sid?: string | null;
      p_message_sid?: string | null;
    },
  ): Promise<{
    data: { id: number; inserted: boolean; amount: number; type: string; idempotency_key: string; workspace: string } | null;
    error: null;
  }> => {
    if (fn !== "apply_ledger_entry_and_sync_credits") {
      return { data: null, error: null };
    }
    const key = args.p_idempotency_key?.trim() ?? "";
    const existing = transactionRows.find(
      (r) =>
        r.workspace === args.p_workspace_id &&
        r.type === args.p_type &&
        r.idempotency_key === key,
    );
    if (existing) {
      return {
        data: {
          id: existing.id,
          inserted: false,
          amount: existing.amount,
          type: existing.type,
          idempotency_key: existing.idempotency_key ?? "",
          workspace: existing.workspace,
        },
        error: null,
      };
    }
    const created: TransactionRow = {
      id: nextId++,
      workspace: args.p_workspace_id,
      type: args.p_type as TransactionRow["type"],
      amount: args.p_amount,
      note: args.p_description ?? "",
      idempotency_key: key,
      created_at: new Date().toISOString(),
    };
    transactionRows.push(created);
    return {
      data: {
        id: created.id,
        inserted: true,
        amount: created.amount,
        type: created.type,
        idempotency_key: created.idempotency_key ?? "",
        workspace: created.workspace,
      },
      error: null,
    };
  };
}

/** Supabase stub for insertTransactionHistoryIdempotent (idempotency_key column). */
export function makeTransactionHistoryTableStub(transactionRows: TransactionRow[]) {
  let nextId = 1;
  const q: {
    workspace?: string;
    type?: string;
    idempotency_key?: string;
  } = {};

  const builder: {
    select: () => typeof builder;
    eq: (col: string, val: unknown) => typeof builder;
    order: () => typeof builder;
    limit: () => {
      maybeSingle: () => Promise<{ data: { id: number } | null; error: null }>;
    };
    insert: (row: {
      workspace: string;
      type: string;
      amount: number;
      note: string;
      idempotency_key?: string;
    }) => {
      select: () => {
        single: () => Promise<{ data: { id: number } | null; error: Error & { code: string } | null }>;
      };
    };
  } = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      if (col === "workspace") q.workspace = String(val);
      if (col === "type") q.type = String(val);
      if (col === "idempotency_key") q.idempotency_key = String(val);
      return builder;
    },
    order: () => builder,
    limit: () => {
      const resultPromise = (async () => {
        const matches = transactionRows.filter(
          (r) =>
            (!q.workspace || r.workspace === q.workspace) &&
            (!q.type || r.type === q.type) &&
            (!q.idempotency_key || r.idempotency_key === q.idempotency_key),
        );
        const latest = matches.at(-1);
        return {
          data: latest ? [{ id: latest.id }] : [],
          error: null,
        };
      })();

      return Object.assign(resultPromise, {
        maybeSingle: async () => {
          const { data } = await resultPromise;
          return { data: data[0] ?? null, error: null };
        },
      });
    },
    insert: (row) => ({
      select: () => ({
        single: async () => {
          const duplicate = transactionRows.some(
            (r) =>
              r.workspace === row.workspace &&
              r.type === row.type &&
              r.idempotency_key === row.idempotency_key &&
              row.idempotency_key != null,
          );
          if (duplicate) {
            return { data: null, error: uniqueViolationError() };
          }
          const created: TransactionRow = {
            id: nextId++,
            workspace: row.workspace,
            type: row.type as TransactionRow["type"],
            amount: row.amount,
            note: row.note,
            idempotency_key: row.idempotency_key,
            created_at: new Date().toISOString(),
          };
          transactionRows.push(created);
          return { data: { id: created.id }, error: null };
        },
      }),
    }),
  };

  return builder;
}
