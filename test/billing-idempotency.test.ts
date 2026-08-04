import { describe, expect, test, vi } from "vitest";

import { db } from "@/server/db";
import { insertTransactionHistoryIdempotent } from "../app/lib/transaction-history.server";
import { type TransactionRow } from "./helpers/transaction-history-stub";

const transactionRowsState = vi.hoisted(() => ({
  rows: [] as TransactionRow[],
  nextId: 1,
  shouldThrow: null as string | null,
}));

vi.mock("@/server/db", () => ({
  db: {
    execute: vi.fn(async (query: any) => {
      if (transactionRowsState.shouldThrow) {
        throw new Error(transactionRowsState.shouldThrow);
      }
      const params = query.queryChunks.filter(
        (c: any) => !(typeof c === "object" && c !== null && c.constructor?.name === "StringChunk"),
      );
      const [
        workspace,
        type,
        amount,
        idempotencyKey,
        note,
      ] = params;
      const key = String(idempotencyKey).trim();
      const existing = transactionRowsState.rows.find(
        (r) => r.workspace === workspace && r.type === type && r.idempotency_key === key,
      );
      if (existing) {
        return [
          {
            id: existing.id,
            inserted: false,
            amount: existing.amount,
            type: existing.type,
            idempotency_key: existing.idempotency_key,
            workspace: existing.workspace,
          },
        ];
      }
      const created: TransactionRow = {
        id: transactionRowsState.nextId++,
        workspace: String(workspace),
        type: type as TransactionRow["type"],
        amount: Number(amount),
        note: String(note ?? ""),
        idempotency_key: key,
        created_at: new Date().toISOString(),
      };
      transactionRowsState.rows.push(created);
      return [
        {
          id: created.id,
          inserted: true,
          amount: created.amount,
          type: created.type,
          idempotency_key: created.idempotency_key,
          workspace: created.workspace,
        },
      ];
    }),
  },
  dbDirect: { execute: vi.fn() },
  pool: {},
  directPool: {},
}));

function resetTransactionRows(rows: TransactionRow[] = []) {
  transactionRowsState.rows = rows;
  transactionRowsState.nextId = 1;
  transactionRowsState.shouldThrow = null;
  (db.execute as ReturnType<typeof vi.fn>).mockClear();
}

describe("billing idempotency", () => {
  test("inserts a row with deterministic idempotency_key", async () => {
    const rows: TransactionRow[] = [];
    resetTransactionRows(rows);

    const res = await insertTransactionHistoryIdempotent({
      workspaceId: "w1",
      type: "DEBIT",
      amount: -2,
      note: "Call CA123",
      idempotencyKey: "call:CA123:staffed",
    });

    expect(res).toEqual({ inserted: true, existingId: expect.any(Number) });
    expect(rows).toHaveLength(1);
    expect(rows[0].idempotency_key).toBe("call:CA123:staffed");
    expect(rows[0].amount).toBe(-2);
  });

  test("returns inserted:false when DB unique constraint reports duplicate", async () => {
    const rows: TransactionRow[] = [];
    resetTransactionRows(rows);

    await insertTransactionHistoryIdempotent({
      workspaceId: "w1",
      type: "DEBIT",
      amount: -1,
      note: "SMS abc delivered",
      idempotencyKey: "sms:abc",
    });
    const res = await insertTransactionHistoryIdempotent({
      workspaceId: "w1",
      type: "DEBIT",
      amount: -1,
      note: "SMS abc delivered",
      idempotencyKey: "sms:abc",
    });

    expect(res.inserted).toBe(false);
    expect(rows).toHaveLength(1);
  });

  test("throws when idempotency key is blank", async () => {
    const rows: TransactionRow[] = [];
    resetTransactionRows(rows);

    await expect(
      insertTransactionHistoryIdempotent({
        workspaceId: "w1",
        type: "DEBIT",
        amount: -1,
        note: "n",
        idempotencyKey: "   ",
      }),
    ).rejects.toThrow("idempotencyKey is required");
  });

  test("throws when RPC returns an error", async () => {
    const rows: TransactionRow[] = [];
    resetTransactionRows(rows);
    transactionRowsState.shouldThrow = "rpc failed";

    await expect(
      insertTransactionHistoryIdempotent({
        workspaceId: "w1",
        type: "DEBIT",
        amount: -1,
        note: "n",
        idempotencyKey: "k",
      }),
    ).rejects.toThrow("rpc failed");
  });
});
