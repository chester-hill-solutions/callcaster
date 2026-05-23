import { buildQueuedQueueUpdate } from "@/lib/queue-status";
import { data as routeData } from "react-router";
import { getSupabaseServerClientWithSession } from "@/lib/supabase.server";
import { logger } from "@/lib/logger.server";
import { safeParseJson } from "@/lib/database.server";
import type { LoaderFunctionArgs } from "react-router";

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
        return routeData([]);
    }
    const { data: newQueue } = await supabase.rpc('select_and_update_campaign_contacts', { p_campaign_id: Number(campaign_id), p_initial_limit: parseInt(limit) })
    
    if (!newQueue || !newQueue.length) return routeData([]);
    const { data: queueItems } = await supabase.from('campaign_queue').select('*, contact(*)').in('id', newQueue.map((i: { queue_id: number }) => i.queue_id));
    return routeData(queueItems);
}
