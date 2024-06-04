import { json } from "@remix-run/react";
import { getSupabaseServerClientWithSession } from "../lib/supabase.server";

export const action = async ({ request }) => {
    const { supabaseClient, headers, serverSession } = await getSupabaseServerClientWithSession(request);
    const { callId, update } = await request.json();
    let response;
    if (callId) {
        // Update the existing record
        const { data, error } = await supabaseClient
            .from('outreach_attempt')
            .upsert({ result: update })
            .eq('id', callId);

        if (error) {
            return json({ error }, { status: 500, headers });
        }
        response = data;
    } else {
        const { data, error } = await supabaseClient
            .from('outreach_attempt')
            .insert({ result: update });

        if (error) {
            return json({ error }, { status: 500, headers });
        }
        response = data;
    }

    return json(response, { headers });
};
