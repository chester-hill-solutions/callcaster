import { json } from "@remix-run/react";
import { getSupabaseServerClientWithSession } from "../lib/supabase.server";

export const action = async ({ request }) => {
    const { supabaseClient, headers } =
        await getSupabaseServerClientWithSession(request);

    const method = request.method;

    let response;

    if (method === 'post') {
        const data = await request.json();
        
        const { data: campaign_audience, error } = await supabaseClient
            .from('campaign_audience')
            .insert(data)
            .select();
        response = campaign_audience;
    }
    if (method === 'delete'){
        const data = await request.json();
        const {data: removal, error} = await supabaseClient
        .from('campaign_audience')
        .delete()
        .eq('audience_id', data.audience_id)
    }

    return json(response, {headers});
};
