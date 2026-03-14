import { describe, expect, test } from "vitest";

import { enqueueContactsForCampaign } from "../app/lib/queue.server";

describe("queue.server", () => {
  test("returns early when no contacts", async () => {
    const supabase = {
      rpc: async () => ({ error: null }),
    } as any;
    await expect(
      enqueueContactsForCampaign(supabase, 1, []),
    ).resolves.toBeUndefined();
  });

  test("reserves startOrder in DB when not provided", async () => {
    const rpcCalls: any[] = [];
    const supabase = {
      rpc: async (fn: string, args: any) => {
        rpcCalls.push({ fn, args });
        if (fn === "reserve_campaign_queue_order_range") {
          return { data: 10, error: null };
        }
        return { error: null };
      },
    } as any;

    await enqueueContactsForCampaign(supabase, 7, [1, 2], { requeue: true });

    expect(rpcCalls[0]).toEqual({
      fn: "reserve_campaign_queue_order_range",
      args: { p_campaign_id: 7, p_count: 2 },
    });
    expect(rpcCalls.slice(1)).toEqual([
      {
        fn: "handle_campaign_queue_entry",
        args: {
          p_contact_id: 1,
          p_campaign_id: 7,
          p_queue_order: 10,
          p_requeue: true,
        },
      },
      {
        fn: "handle_campaign_queue_entry",
        args: {
          p_contact_id: 2,
          p_campaign_id: 7,
          p_queue_order: 11,
          p_requeue: true,
        },
      },
    ]);
  });

  test("throws when startOrder reservation RPC fails", async () => {
    const supabase = {
      rpc: async () => ({ data: null, error: new Error("reserve failed") }),
    } as any;

    await expect(enqueueContactsForCampaign(supabase, 1, [1])).rejects.toThrow(
      "Failed to reserve queue order range",
    );
  });

  test("uses provided startOrder and batches >100 contacts", async () => {
    const calls: any[] = [];
    const supabase = {
      rpc: async (fn: string, args: any) => {
        calls.push({ fn, args });
        return { error: null };
      },
    } as any;

    const ids = Array.from({ length: 101 }, (_, i) => i + 1);
    await enqueueContactsForCampaign(supabase, 9, ids, { startOrder: 5 });

    expect(calls).toHaveLength(101);
    expect(calls[0]).toMatchObject({
      fn: "handle_campaign_queue_entry",
      args: {
        p_contact_id: 1,
        p_queue_order: 5,
        p_requeue: false,
      },
    });
    expect(calls[100]).toMatchObject({
      fn: "handle_campaign_queue_entry",
      args: {
        p_contact_id: 101,
        p_queue_order: 105,
        p_requeue: false,
      },
    });
    expect(
      calls.some((call) => call.fn === "reserve_campaign_queue_order_range"),
    ).toBe(false);
  });

  test("accepts string startOrder values from parsed forms", async () => {
    const calls: any[] = [];
    const supabase = {
      rpc: async (fn: string, args: any) => {
        calls.push({ fn, args });
        return { error: null };
      },
    } as any;

    await enqueueContactsForCampaign(supabase, 9, [1, 2], { startOrder: "5" });
    expect(calls).toEqual([
      {
        fn: "handle_campaign_queue_entry",
        args: {
          p_contact_id: 1,
          p_campaign_id: 9,
          p_queue_order: 5,
          p_requeue: false,
        },
      },
      {
        fn: "handle_campaign_queue_entry",
        args: {
          p_contact_id: 2,
          p_campaign_id: 9,
          p_queue_order: 6,
          p_requeue: false,
        },
      },
    ]);
  });

  test("throws when queue-entry RPC returns error", async () => {
    const supabase = {
      rpc: async (fn: string) => {
        if (fn === "reserve_campaign_queue_order_range") {
          return { data: 1, error: null };
        }
        return { error: new Error("rpc") };
      },
    } as any;
    await expect(enqueueContactsForCampaign(supabase, 1, [1])).rejects.toThrow(
      "Failed to enqueue",
    );
  });

  test("falls back to reservation when startOrder is non-numeric string", async () => {
    const calls: any[] = [];
    const supabase = {
      rpc: async (fn: string, args: any) => {
        calls.push({ fn, args });
        if (fn === "reserve_campaign_queue_order_range") {
          return { data: 4, error: null };
        }
        return { error: null };
      },
    } as any;

    await enqueueContactsForCampaign(supabase, 8, [11], { startOrder: "abc" });
    expect(calls[1]).toMatchObject({
      fn: "handle_campaign_queue_entry",
      args: { p_queue_order: 4 },
    });
  });
});
