import { describe, expect, test } from "vitest";

import { enqueueContactsForCampaign } from "../app/lib/queue.server";

describe("queue.server", () => {
  test("returns early when no contacts", async () => {
    const supabase = {
      from: () => ({}),
      rpc: async () => ({ error: null }),
    } as any;
    await expect(
      enqueueContactsForCampaign(supabase, 1, []),
    ).resolves.toBeUndefined();
  });

  test("computes startOrder from max existing order when not provided", async () => {
    const rpcCalls: any[] = [];
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: { queue_order: 9 },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
      rpc: async (_fn: string, args: any) => {
        rpcCalls.push(args);
        return { error: null };
      },
    } as any;

    await enqueueContactsForCampaign(supabase, 7, [1, 2], { requeue: true });
    expect(rpcCalls).toEqual([
      { p_contact_id: 1, p_campaign_id: 7, p_queue_order: 10, p_requeue: true },
      { p_contact_id: 2, p_campaign_id: 7, p_queue_order: 11, p_requeue: true },
    ]);
  });

  test("throws when maxOrder lookup errors", async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: new Error("db"),
                }),
              }),
            }),
          }),
        }),
      }),
      rpc: async () => ({ error: null }),
    } as any;
    await expect(enqueueContactsForCampaign(supabase, 1, [1])).rejects.toThrow(
      "db",
    );
  });

  test("uses provided startOrder and batches >100 contacts", async () => {
    const calls: any[] = [];
    const supabase = {
      from: () => {
        throw new Error("should not query max order");
      },
      rpc: async (_fn: string, args: any) => {
        calls.push(args);
        return { error: null };
      },
    } as any;

    const ids = Array.from({ length: 101 }, (_, i) => i + 1);
    await enqueueContactsForCampaign(supabase, 9, ids, { startOrder: 5 });
    expect(calls).toHaveLength(101);
    expect(calls[0]).toMatchObject({
      p_contact_id: 1,
      p_queue_order: 5,
      p_requeue: false,
    });
    expect(calls[100]).toMatchObject({
      p_contact_id: 101,
      p_queue_order: 105,
      p_requeue: false,
    });
  });

  test("accepts string startOrder values from parsed forms", async () => {
    const calls: any[] = [];
    const supabase = {
      from: () => {
        throw new Error("should not query max order");
      },
      rpc: async (_fn: string, args: any) => {
        calls.push(args);
        return { error: null };
      },
    } as any;

    await enqueueContactsForCampaign(supabase, 9, [1, 2], { startOrder: "5" });
    expect(calls).toEqual([
      { p_contact_id: 1, p_campaign_id: 9, p_queue_order: 5, p_requeue: false },
      { p_contact_id: 2, p_campaign_id: 9, p_queue_order: 6, p_requeue: false },
    ]);
  });

  test("throws when rpc returns error", async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
      rpc: async () => ({ error: new Error("rpc") }),
    } as any;
    await expect(enqueueContactsForCampaign(supabase, 1, [1])).rejects.toThrow(
      "rpc",
    );
  });

  test("falls back to max order lookup when startOrder is non-numeric string", async () => {
    const calls: any[] = [];
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: { queue_order: 3 },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
      rpc: async (_fn: string, args: any) => {
        calls.push(args);
        return { error: null };
      },
    } as any;

    await enqueueContactsForCampaign(supabase, 8, [11], { startOrder: "abc" });
    expect(calls[0]).toMatchObject({ p_queue_order: 4 });
  });

  test("falls back to max-order lookup and starts at 1 when no queue rows exist", async () => {
    const calls: any[] = [];
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
      rpc: async (_fn: string, args: any) => {
        calls.push(args);
        return { error: null };
      },
    } as any;

    await enqueueContactsForCampaign(supabase, 9, [1], {
      startOrder: null as any,
    });

    expect(calls).toEqual([
      { p_contact_id: 1, p_campaign_id: 9, p_queue_order: 1, p_requeue: false },
    ]);
  });
});
