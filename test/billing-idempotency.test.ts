import { describe, expect, test } from "vitest";

import { insertTransactionHistoryIdempotent } from "../app/lib/transaction-history.server";

function uniqueViolationError(message = "duplicate"): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = "23505";
  return error;
}

describe("billing idempotency", () => {
  test("inserts a row with deterministic idempotency_key", async () => {
    const calls: any[] = [];
    const supabase: any = {
      from: () => ({
        insert: (row: any) => {
          calls.push(row);
          return {
            select: () => ({
              single: async () => ({ data: { id: 999 }, error: null }),
            }),
          };
        },
      }),
    };

    const res = await insertTransactionHistoryIdempotent({
      supabase,
      workspaceId: "w1",
      type: "DEBIT",
      amount: -2,
      note: "Call CA123",
      idempotencyKey: "call:CA123",
    });

    expect(res).toEqual({ inserted: true, existingId: 999 });
    expect(calls).toEqual([
      {
        workspace: "w1",
        type: "DEBIT",
        amount: -2,
        note: "Call CA123",
        idempotency_key: "call:CA123",
      },
    ]);
  });

  test("returns inserted:false when DB unique constraint reports duplicate", async () => {
    const supabase: any = {
      from: () => {
        const builder: any = {};
        builder.insert = () => ({
          select: () => ({
            single: async () => ({ data: null, error: uniqueViolationError() }),
          }),
        });
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.order = () => builder;
        builder.limit = () => ({
          maybeSingle: async () => ({ data: { id: 123 }, error: null }),
        });
        return builder;
      },
    };

    const res = await insertTransactionHistoryIdempotent({
      supabase,
      workspaceId: "w1",
      type: "DEBIT",
      amount: -1,
      note: "SMS abc delivered",
      idempotencyKey: "sms:abc",
    });

    expect(res).toEqual({ inserted: false, existingId: 123 });
  });

  test("throws when idempotency key is blank", async () => {
    const supabase: any = { from: () => ({}) };

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

  test("throws when insert fails with non-unique error", async () => {
    const supabase: any = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: null,
              error: new Error("insert failed"),
            }),
          }),
        }),
      }),
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
    ).rejects.toThrow("insert failed");
  });
});
