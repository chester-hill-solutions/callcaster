import { describe, expect, test, vi } from "vitest";
import {
  billingUnitsFromDurationSeconds,
  canTransitionOutreachDisposition,
  checkWorkspaceCredits,
  getCallWithRetry,
  insertTransactionHistoryIdempotent,
} from "../supabase/functions/_shared/ivr-status-logic.ts";

describe("ivr-status shared logic", () => {
  test("billingUnitsFromDurationSeconds rounds up per started minute", () => {
    expect(billingUnitsFromDurationSeconds(0)).toBe(-1);
    expect(billingUnitsFromDurationSeconds(1)).toBe(-1);
    expect(billingUnitsFromDurationSeconds(60)).toBe(-2);
    expect(billingUnitsFromDurationSeconds(61)).toBe(-2);
  });

  test("canTransitionOutreachDisposition blocks terminal -> different", () => {
    expect(canTransitionOutreachDisposition("completed", "busy")).toBe(false);
    expect(canTransitionOutreachDisposition("voicemail", "completed")).toBe(false);
    expect(canTransitionOutreachDisposition("in-progress", "completed")).toBe(true);
    expect(canTransitionOutreachDisposition(null, "completed")).toBe(true);
  });

  test("getCallWithRetry retries then succeeds", async () => {
    const calls: any[] = [];
    let attempt = 0;
    const supabase: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => {
              attempt++;
              calls.push(attempt);
              if (attempt < 3) return { data: null, error: new Error("no row") };
              return { data: { sid: "CA1" }, error: null };
            },
          }),
        }),
      }),
    };

    const sleep = vi.fn(async () => undefined);
    const res = await getCallWithRetry(supabase, "CA1", {
      maxRetries: 5,
      retryDelayMs: 1,
      sleep,
    });
    expect(res).toMatchObject({ sid: "CA1" });
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  test("checkWorkspaceCredits disables campaign and cancels call when credits are 0", async () => {
    const updates: any[] = [];
    const supabase: any = {
      from: (table: string) => {
        if (table === "workspace") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { credits: 0 }, error: null }),
              }),
            }),
          };
        }
        if (table === "campaign") {
          return {
            update: (patch: any) => ({
              eq: async () => {
                updates.push(patch);
                return { data: null, error: null };
              },
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
    const twilioClient = {
      calls: () => ({
        update: vi.fn(async () => ({})),
      }),
    };

    const ok = await checkWorkspaceCredits({
      supabase,
      workspaceId: "w1",
      campaignId: "c1",
      callSid: "CA1",
      twilioClient,
    });
    expect(ok).toBe(false);
    expect(updates).toEqual([{ is_active: false }]);
  });

  test("insertTransactionHistoryIdempotent inserts once for same marker", async () => {
    const rows: any[] = [];
    const supabase: any = {
      from: (table: string) => {
        if (table !== "transaction_history") throw new Error("unexpected table");
        const builder: any = {};
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.like = () => builder;
        builder.limit = async () => ({ data: rows.length ? [{ id: 1 }] : [], error: null });
        builder.insert = (row: any) => {
          rows.push(row);
          return { data: null, error: null };
        };
        return builder;
      },
    };

    const r1 = await insertTransactionHistoryIdempotent({
      supabase,
      workspaceId: "w1",
      type: "DEBIT",
      amount: -1,
      note: "IVR Call CA1",
      idempotencyKey: "call:CA1",
    });
    const r2 = await insertTransactionHistoryIdempotent({
      supabase,
      workspaceId: "w1",
      type: "DEBIT",
      amount: -1,
      note: "IVR Call CA1",
      idempotencyKey: "call:CA1",
    });
    expect(r1.inserted).toBe(true);
    expect(r2.inserted).toBe(false);
    expect(rows.length).toBe(1);
    expect(rows[0].note).toContain("[idempotency:call:CA1]");
  });

  test("insertTransactionHistoryIdempotent serializes concurrent inserts", async () => {
    const rows: any[] = [];
    const supabase: any = {
      from: (table: string) => {
        if (table !== "transaction_history") throw new Error("unexpected table");
        const builder: any = {};
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.like = () => builder;
        builder.limit = async () => ({
          data: rows.length ? [{ id: 1 }] : [],
          error: null,
        });
        builder.insert = (row: any) => {
          rows.push(row);
          return { data: null, error: null };
        };
        return builder;
      },
    };

    const [r1, r2] = await Promise.all([
      insertTransactionHistoryIdempotent({
        supabase,
        workspaceId: "w1",
        type: "DEBIT",
        amount: -1,
        note: "IVR Call CA1",
        idempotencyKey: "call:CA1",
      }),
      insertTransactionHistoryIdempotent({
        supabase,
        workspaceId: "w1",
        type: "DEBIT",
        amount: -1,
        note: "IVR Call CA1",
        idempotencyKey: "call:CA1",
      }),
    ]);

    expect(r1.inserted).toBe(true);
    expect(r2.inserted).toBe(false);
    expect(rows).toHaveLength(1);
  });
});

