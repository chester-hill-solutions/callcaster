import type { SupabaseClient } from "@supabase/supabase-js";

const BATCH_SIZE = 100;

/**
 * Enqueue contacts for a campaign using the unified handle_campaign_queue_entry RPC.
 * Handles deduplication, ordering, and requeue semantics consistently.
 */
export async function enqueueContactsForCampaign(
  supabaseClient: SupabaseClient,
  campaignId: number,
  contactIds: number[],
  options?: { startOrder?: number; requeue?: boolean }
) {
  if (contactIds.length === 0) return;

  const requeue = options?.requeue ?? false;
  let startOrder = options?.startOrder;

  if (startOrder === undefined) {
    const { data: maxOrder, error: maxOrderError } = await supabaseClient
      .from("campaign_queue")
      .select("queue_order")
      .eq("campaign_id", campaignId)
      .order("queue_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (maxOrderError) throw maxOrderError;
    startOrder = (maxOrder?.queue_order ?? 0) + 1;
  }

  for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
    const batch = contactIds.slice(i, i + BATCH_SIZE);
    for (let j = 0; j < batch.length; j++) {
      const { error } = await supabaseClient.rpc("handle_campaign_queue_entry", {
        p_contact_id: batch[j],
        p_campaign_id: campaignId,
        p_queue_order: startOrder + i + j,
        p_requeue: requeue,
      });

      if (error) throw error;
    }
  }
}
