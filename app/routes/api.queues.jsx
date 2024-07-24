import { json } from "@remix-run/node";
import { createSupabaseServerClient, getSupabaseServerClientWithSession } from "../lib/supabase.server";

export const loader = async ({ request, params }) => {
    const { supabaseClient: supabase, serverSession } = await getSupabaseServerClientWithSession(request);
    const url = new URL(request.url);
    const searchParams = url.searchParams;
    const campaign_id = searchParams.get('campaign_id');
    const limit = searchParams.get('limit') ?? 10;
    if (parseInt(limit) === 0) {
        return json([]);
    }

    const { data: newQueue, error: newQueueError } = await supabase.rpc('select_and_update_campaign_contacts', {p_campaign_id:campaign_id, p_initial_limit:limit})
    if (newQueueError || !newQueue.length) return json([]);
    const {data: queueItems, error: queueItemsError} = await supabase.from('campaign_queue').select('*, contact(*)').in('id', newQueue.map((i) => i.queue_id));
    return json(queueItems);
};

export const action = async ({ request, params }) => {
    const { supabaseClient: supabase } = createSupabaseServerClient(request);
    const { contact_id, household } = await request.json();
    const { data, error } = await supabase.rpc('dequeue_contact', { passed_contact_id: contact_id, group_on_household: household })
    if (error) {
        console.error('Error updating campaign queue:', error);
        return json({ error: error.message }, { status: 500 });
    }
    return json(data);
}