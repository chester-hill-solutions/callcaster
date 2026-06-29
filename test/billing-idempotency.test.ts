import { describe, expect, test } from "vitest";

import { insertTransactionHistoryIdempotent } from "../app/lib/transaction-history.server";
import {
  makeApplyLedgerEntryRpcStub,
  type TransactionRow,
} from "./helpers/transaction-history-stub";

describe("billing idempotency", () => {
  test("inserts a row with deterministic idempotency_key", async () => {
    const rows: TransactionRow[] = [];
    const rpc = makeApplyLedgerEntryRpcStub(rows);
    const supabase: any = { rpc };

    const res = await insertTransactionHistoryIdempotent({
      supabase,
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
    const rpc = makeApplyLedgerEntryRpcStub(rows);
    const supabase: any = { rpc };

    await insertTransactionHistoryIdempotent({
      supabase,
      workspaceId: "w1",
      type: "DEBIT",
      amount: -1,
      note: "SMS abc delivered",
      idempotencyKey: "sms:abc",
    });
    const res = await insertTransactionHistoryIdempotent({
      supabase,
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
    const supabase: any = { rpc: makeApplyLedgerEntryRpcStub(rows) };

    await expect(
      insertTransactionHistoryIdempotent({
        supabase,
        workspaceId: "w1",
        type: "DEBIT",
        amount: -1,
        note: "n",
        idempotencyKey: "   ",
      }),
    ).rejects.toThrow("idempotencyKey is required");
  });

  test("throws when RPC returns an error", async () => {
    const supabase: any = {
      rpc: async () => ({ data: null, error: new Error("rpc failed") }),
    };

    await expect(
      insertTransactionHistoryIdempotent({
        supabase,
        workspaceId: "w1",
        type: "DEBIT",
        amount: -1,
        note: "n",
        idempotencyKey: "k",
      }),
    ).rejects.toThrow("rpc failed");
  });
});
