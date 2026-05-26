import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleQueueSyncEvent } from "../_shared/queue-sync.ts";

function makeSupabaseStub(args: {
  audienceToContacts: Record<number, number[]>;
  existingQueue: Array<{ campaign_id: number; contact_id: number }>;
}) {
  const queue = [...args.existingQueue];
  let nextQueueId = queue.length + 1;

  const supabase = {
    rpc: async (
      fn: string,
      params: { p_contact_id: number; p_campaign_id: number; p_requeue?: boolean },
    ) => {
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
                  const row = queue[i];
                  if (
                    row.campaign_id === campaignId &&
                    contactIds.includes(row.contact_id)
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

  return supabase;
}

Deno.test("handleQueueSyncEvent INSERT requeues audience contacts", async () => {
  const supabase = makeSupabaseStub({
    audienceToContacts: { 10: [1, 2] },
    existingQueue: [{ campaign_id: 99, contact_id: 1 }],
  });

  const result = await handleQueueSyncEvent({
    supabase: supabase as never,
    type: "INSERT",
    record: { audience_id: 10, campaign_id: 99 },
    old_record: null,
  });

  assertEquals(result, [2, 3]);
});

Deno.test("handleQueueSyncEvent DELETE removes queue rows for audience contacts", async () => {
  const supabase = makeSupabaseStub({
    audienceToContacts: { 10: [1, 2] },
    existingQueue: [
      { campaign_id: 99, contact_id: 1 },
      { campaign_id: 99, contact_id: 2 },
      { campaign_id: 99, contact_id: 3 },
    ],
  });

  await handleQueueSyncEvent({
    supabase: supabase as never,
    type: "DELETE",
    record: null,
    old_record: { audience_id: 10, campaign_id: 99 },
  });

  assertEquals((supabase as { _queue: unknown[] })._queue.length, 1);
});
