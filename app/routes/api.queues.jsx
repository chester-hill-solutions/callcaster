import { json } from "@remix-run/node";
import { createSupabaseServerClient } from "../lib/supabase.server";

export const loader = async ({ request, params }) => {
    const { supabaseClient: supabase } = createSupabaseServerClient(request);
    const url = new URL(request.url);
    const searchParams = url.searchParams;
    const campaign_id = searchParams.get('campaign_id');
    const limit = searchParams.get('limit') ?? 5;
    
    const { data: contacts, error: contactsError } = await supabase.rpc('get_contacts_by_households', { selected_campaign_id: campaign_id, households_limit: limit }).order('attempts').order('queue_order');
    if (contactsError) {
        console.error(contactsError);
        return json({ error: contactsError.message });
    }
    return json(contacts);
};
