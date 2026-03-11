import { describe, expect, test } from "vitest";
import { insertTransactionHistoryIdempotent } from "../app/lib/transaction-history.server";

function makeSupabaseMock(args: { existingId?: number }) {
  const calls: any[] = [];

  const from = (table: string) => {
    if (table !== "transaction_history") throw new Error("unexpected table");

    const selectBuilder: any = {
      select: () => selectBuilder,
      eq: () => selectBuilder,
      like: () => selectBuilder,
      order: () => selectBuilder,
      limit: async () => ({
        data: args.existingId ? [{ id: args.existingId }] : [],
        error: null,
      }),
    };

    const insertBuilder: any = {
      insert: (row: any) => {
        calls.push({ op: "insert", row });
        return {
          select: () => ({
            single: async () => ({ data: { id: 999 }, error: null }),
          }),
        };
      },
      // allow calling select-first directly on from()
      ...selectBuilder,
    };

    return insertBuilder;
  };

  return { supabase: { from } as any, calls };
}

describe("billing idempotency", () => {
  test("skips insert when an idempotency marker already exists", async () => {
    const { supabase, calls } = makeSupabaseMock({ existingId: 123 });
    const res = await insertTransactionHistoryIdempotent({
      supabase,
      workspaceId: "w1",
      type: "DEBIT",
      amount: -1,
      note: "SMS abc delivered",
      idempotencyKey: "sms:abc",
    });
    expect(res.inserted).toBe(false);
    expect(res.existingId).toBe(123);
    expect(calls.filter((c) => c.op === "insert").length).toBe(0);
  });

  test("inserts once and embeds the idempotency marker in note", async () => {
    const { supabase, calls } = makeSupabaseMock({ existingId: undefined });
    const res = await insertTransactionHistoryIdempotent({
      supabase,
      workspaceId: "w1",
      type: "DEBIT",
      amount: -2,
      note: "Call CA123",
      idempotencyKey: "call:CA123",
    });
    expect(res.inserted).toBe(true);
    const inserted = calls.find((c) => c.op === "insert")?.row;
    expect(inserted).toBeTruthy();
    expect(inserted.note).toContain("[idempotency:call:CA123]");
  });

  test("does not duplicate marker if note already includes it", async () => {
    const { supabase, calls } = makeSupabaseMock({ existingId: undefined });
    const res = await insertTransactionHistoryIdempotent({
      supabase,
      workspaceId: "w1",
      type: "DEBIT",
      amount: -2,
      note: "Call CA123 [idempotency:call:CA123]",
      idempotencyKey: "call:CA123",
    });
    expect(res.inserted).toBe(true);
    const inserted = calls.find((c) => c.op === "insert")?.row;
    expect(inserted.note).toBe("Call CA123 [idempotency:call:CA123]");
  });

  test("continues to insert when existing-row lookup errors", async () => {
    const calls: any[] = [];
    const supabase: any = {
      from: () => {
        const builder: any = {};
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.like = () => builder;
        builder.order = () => builder;
        builder.limit = async () => ({ data: null, error: new Error("boom") });
        builder.insert = (row: any) => {
          calls.push(row);
          return {
            select: () => ({
              single: async () => ({ data: { id: 1 }, error: null }),
            }),
          };
        };
        return builder;
      },
    };

    const res = await insertTransactionHistoryIdempotent({
      supabase,
      workspaceId: "w1",
      type: "DEBIT",
      amount: -1,
      note: "n",
      idempotencyKey: "k",
    });
    expect(res.inserted).toBe(true);
    expect(calls.length).toBe(1);
  });

  test("throws when insert fails", async () => {
    const supabase: any = {
      from: () => {
        const builder: any = {};
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.like = () => builder;
        builder.order = () => builder;
        builder.limit = async () => ({ data: [], error: null });
        builder.insert = () => ({
          select: () => ({
            single: async () => ({ data: null, error: new Error("insert failed") }),
          }),
        });
        return builder;
      },
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

  test("serializes concurrent inserts for the same idempotency key", async () => {
    const rows: Array<{ id: number; note: string }> = [];
    let nextId = 1;
    const supabase: any = {
      from: () => {
        const builder: any = {};
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.like = () => builder;
        builder.order = () => builder;
        builder.limit = async () => {
          const existing = rows.map((row) => ({ id: row.id }));
          return { data: existing, error: null };
        };
        builder.insert = (row: any) => ({
          select: () => ({
            single: async () => {
              const inserted = { id: nextId++, note: row.note };
              rows.push(inserted);
              return { data: { id: inserted.id }, error: null };
            },
          }),
        });
        return builder;
      },
    };

    const [first, second] = await Promise.all([
      insertTransactionHistoryIdempotent({
        supabase,
        workspaceId: "w1",
        type: "DEBIT",
        amount: -1,
        note: "n",
        idempotencyKey: "same",
      }),
      insertTransactionHistoryIdempotent({
        supabase,
        workspaceId: "w1",
        type: "DEBIT",
        amount: -1,
        note: "n",
        idempotencyKey: "same",
      }),
    ]);

    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    expect(rows).toHaveLength(1);
  });
});

