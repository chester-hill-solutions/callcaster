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
