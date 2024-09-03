import { json } from "@remix-run/react";
import { getSupabaseServerClientWithSession } from "../lib/supabase.server";

export const action = async ({ request }) => {
    const { supabaseClient, headers, serverSession } = await getSupabaseServerClientWithSession(request);
    const { update, contact_id, campaign_id, workspace, disposition, queue_id } = await request.json();

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recentOutreach, error: searchError } = await supabaseClient
        .from('outreach_attempt')
        .select()
        .eq('contact_id', contact_id)
        .gte('created_at', tenMinutesAgo)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (searchError && searchError.code !== 'PGRST116') {
        console.error(searchError);
        return json({ error: searchError }, { status: 500, headers });
    }

    let outreachAttempt;

    if (recentOutreach) {
        const { data, error } = await supabaseClient
            .from('outreach_attempt')
            .update({
                ...(update && { result: update }),
                disposition,
                user_id: serverSession.user.id
            })
            .eq('id', recentOutreach.id)
            .select();

        if (error) {
            console.error(error);
            return json({ error }, { status: 500, headers });
        }
        outreachAttempt = data[0];
    } else {
        const { data, error } = await supabaseClient.rpc('create_outreach_attempt', {
            con_id: contact_id,
            cam_id: campaign_id,
            queue_id,
            wks_id: workspace,
            usr_id: serverSession.user.id
        });

        if (error) {
            console.error(error);
            return json({ error }, { status: 500, headers });
        }
        outreachAttempt = data;
    }

    const { data: updatedOutreach, error: updateError } = await supabaseClient
        .from('outreach_attempt')
        .update({
            ...(update && { result: update }),
            disposition
        })
        .eq('id', outreachAttempt.id)
        .select();

    if (updateError) {
        console.error(updateError);
        return json({ error: updateError }, { status: 500, headers });
    }

    return json(updatedOutreach[0], { headers });
};