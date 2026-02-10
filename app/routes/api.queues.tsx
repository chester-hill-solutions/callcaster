import { json } from "@remix-run/node";
import { safeParseJson } from "@/lib/database.server";
import { getSupabaseServerClientWithSession } from "../lib/supabase.server";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { logger } from "@/lib/logger.server";
import { QUEUE_STATUS_QUEUED } from "@/lib/queue-status";

interface DequeueRequest {
  contact_id: number;
  household: boolean;
}

interface ResetRequest {
  userId: string;
  campaignId: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { supabaseClient: supabase } = await getSupabaseServerClientWithSession(request);
    const url = new URL(request.url);
    const searchParams = url.searchParams;
    const campaign_id = searchParams.get('campaign_id');
    const limit = searchParams.get('limit') ?? '10';
    if (parseInt(limit) === 0) {
        return json([]);
    }
    const { data: newQueue } = await supabase.rpc('select_and_update_campaign_contacts', { p_campaign_id: Number(campaign_id), p_initial_limit: parseInt(limit) })
    
    if (!newQueue || !newQueue.length) return json([]);
    const { data: queueItems } = await supabase.from('campaign_queue').select('*, contact(*)').in('id', newQueue.map((i: { queue_id: number }) => i.queue_id));
    return json(queueItems);
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const { supabaseClient: supabase, serverSession } = await getSupabaseServerClientWithSession(request);
    const user = serverSession?.user;

    if (request.method === 'POST') {
        const { contact_id, household }: DequeueRequest = await safeParseJson(request);
        const { data, error } = await supabase.rpc('dequeue_contact', { 
            passed_contact_id: Number(contact_id), 
            group_on_household: household,
            dequeued_by_id: user?.id,
            dequeued_reason_text: "Manually dequeued by user"
        });
        if (error) {
            logger.error('Error updating campaign queue:', error);
            return json({ error: error.message }, { status: 500 });
        }
        return json(data);
    } 
else if (request.method === 'DELETE') {
        const { campaignId }: ResetRequest = await safeParseJson(request);
        const { data, error } = await supabase
            .from('campaign_queue')
            .update({ status: QUEUE_STATUS_QUEUED })
            // Reset all items for campaign
            .eq('campaign_id', Number(campaignId))
            .select();

        if (error) {
            logger.error('Error resetting campaign queue items:', error);
            return json({ error: error.message }, { status: 500 });
        }
        return json({ message: 'Campaign queue items reset successfully', affected_rows: data.length });
    }

    return json({ error: 'Method not allowed' }, { status: 405 });
};
