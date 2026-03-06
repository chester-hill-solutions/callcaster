import { describe, expect, test } from "vitest";
import { handleQueueSyncEvent } from "../supabase/functions/_shared/queue-sync.ts";

function makeSupabaseStub(args: {
  audienceToContacts: Record<number, number[]>;
  existingQueue: Array<{ campaign_id: number; contact_id: number }>;
}) {
  const queue = [...args.existingQueue];
  let nextQueueId = queue.length + 1;

  const supabase = {
    rpc: async (fn: string, params: { p_contact_id: number; p_campaign_id: number; p_requeue?: boolean }) => {
      if (fn !== "handle_campaign_queue_entry") {
        throw new Error(`unexpected rpc ${fn}`);
      }
      queue.push({
        campaign_id: params.p_campaign_id,
        contact_id: params.p_contact_id,
      });
      return { data: nextQueueId++, error: null };
    },
    from: (table: string) => {
      if (table === "contact_audience") {
        return {
          select: () => ({
            eq: async (_col: string, audienceId: number) => ({
              data: (args.audienceToContacts[audienceId] ?? []).map((id) => ({
                contact_id: id,
              })),
              error: null,
            }),
          }),
        };
      }

      if (table === "campaign_queue") {
        return {
          delete: () => ({
            eq: (_col: string, campaignId: number) => ({
              in: async (_col2: string, contactIds: number[]) => {
                const before = queue.length;
                for (let i = queue.length - 1; i >= 0; i--) {
                  const r = queue[i];
                  if (
                    r.campaign_id === campaignId &&
                    contactIds.includes(r.contact_id)
                  ) {
                    queue.splice(i, 1);
                  }
                }
                return {
                  data: Array(before - queue.length).fill({}),
                  error: null,
                };
              },
            }),
          }),
        };
      }

      throw new Error(`unexpected table ${table}`);
    },
    _queue: queue,
  };

  return supabase as any;
}

describe("audience → campaign queue sync", () => {
  test("INSERT requeues every audience contact through the RPC helper", async () => {
    const supabase = makeSupabaseStub({
      audienceToContacts: { 10: [1, 2] },
      existingQueue: [{ campaign_id: 99, contact_id: 1 }],
    });

    const res = await handleQueueSyncEvent({
      supabase,
      type: "INSERT",
      record: { audience_id: 10, campaign_id: 99 },
      old_record: null,
    });

    expect(res).toEqual([2, 3]);
    expect(supabase._queue).toEqual([
      { campaign_id: 99, contact_id: 1 },
      { campaign_id: 99, contact_id: 1 },
      { campaign_id: 99, contact_id: 2 },
    ]);
  });

  test("DELETE removes campaign_queue rows for contacts in audience", async () => {
    const supabase = makeSupabaseStub({
      audienceToContacts: { 10: [1, 2] },
      existingQueue: [
        { campaign_id: 99, contact_id: 1 },
        { campaign_id: 99, contact_id: 2 },
        { campaign_id: 99, contact_id: 3 },
      ],
    });

    await handleQueueSyncEvent({
      supabase,
      type: "DELETE",
      record: null,
      old_record: { audience_id: 10, campaign_id: 99 },
    });

    expect(supabase._queue).toEqual([{ campaign_id: 99, contact_id: 3 }]);
  });
});

