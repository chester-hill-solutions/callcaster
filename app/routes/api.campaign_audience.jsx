import { json } from "@remix-run/react";
import { getSupabaseServerClientWithSession } from "../lib/supabase.server";

export const action = async ({ request }) => {
    const { supabaseClient, headers } = await getSupabaseServerClientWithSession(request);
    let response;
    const method = request.method;

    if (method === 'POST') {
        const data = await request.json();

        const { data: campaign_audience, error } = await supabaseClient
            .from('campaign_audience')
            .insert(data)
            .select();

        if (error) {
            return json({ error: error.message }, { status: 400, headers });
        }

        response = campaign_audience;
    }

    if (method === 'DELETE') {
        const { audience_id } = await request.json();

        const { data: removal, error } = await supabaseClient
            .from('campaign_audience')
            .delete()
            .eq('audience_id', audience_id);

        if (error) {
            return json({ error: error.message }, { status: 400, headers });
        }

        response = removal;
    }

    return json({ ...response }, { headers });
};