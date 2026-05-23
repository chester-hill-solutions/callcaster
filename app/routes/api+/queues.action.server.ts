import { buildQueuedQueueUpdate } from "@/lib/queue-status";
import { data as routeData } from "react-router";
import { getSupabaseServerClientWithSession } from "@/lib/supabase.server";
import { logger } from "@/lib/logger.server";
import { safeParseJson } from "@/lib/database.server";
import type { ActionFunctionArgs } from "react-router";

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
            return routeData({ error: error.message }, { status: 500 });
        }
        return routeData(data);
    } 
else if (request.method === 'DELETE') {
        const { campaignId }: ResetRequest = await safeParseJson(request);
        const { data, error } = await supabase
            .from('campaign_queue')
            .update(buildQueuedQueueUpdate())
            // Reset all items for campaign
            .eq('campaign_id', Number(campaignId))
            .select();

        if (error) {
            logger.error('Error resetting campaign queue items:', error);
            return routeData({ error: error.message }, { status: 500 });
        }
        return routeData({ message: 'Campaign queue items reset successfully', affected_rows: data.length });
    }

    return routeData({ error: 'Method not allowed' }, { status: 405 });
}
