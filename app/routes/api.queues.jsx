import { json } from "@remix-run/node";
import { createSupabaseServerClient } from "../lib/supabase.server";

export const loader = async ({ request, params }) => {
    const { supabaseClient: supabase } = createSupabaseServerClient(request);
    const url = new URL(request.url);
    const searchParams = url.searchParams;
    const campaign_id = searchParams.get('campaign_id');
    const limit = searchParams.get('limit') ?? 5;
    if (parseInt(limit) === 0) {
        return json([]);
    }

    const { data: contacts, error: contactsError } = limit > 0 ? await supabase.rpc('get_contacts_by_households', { selected_campaign_id: campaign_id, households_limit: limit }).order('attempts').order('queue_order') : { data: [], error: null };

    if (contactsError) {
        console.error(contactsError);
        return json({ error: contactsError.message });
    }
    return json(contacts);
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