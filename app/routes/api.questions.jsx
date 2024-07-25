import { json } from "@remix-run/react";
import { getSupabaseServerClientWithSession } from "../lib/supabase.server";

export const action = async ({ request }) => {
    const { supabaseClient, headers, serverSession } = await getSupabaseServerClientWithSession(request);
    const { callId, update, contact_id, campaign_id, workspace, disposition } = await request.json();
    let response;
    if (callId) {
        const { data, error } = await supabaseClient
            .from('outreach_attempt')
            .upsert({id: callId, ...(update && {result: update}), contact_id, user_id: serverSession.user.id, campaign_id, disposition })
            
            .select();

        if (error) {
            console.error(error)
            return json({ error }, { status: 500, headers });
        }
        response = data;
    } else {
        const { data, error } = await supabaseClient
            .from('outreach_attempt')
            .insert({ ...(update && {result: update}), contact_id, user_id: serverSession.user.id, campaign_id, disposition })
            .select();
        if (error) {
            console.error(error)
            return json({ error }, { status: 500, headers });
        }
        response = data;
    }

    return json(response, { headers });
};
