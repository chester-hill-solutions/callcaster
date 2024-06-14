import { json } from "@remix-run/react";
import { createSupabaseServerClient } from "../lib/supabase.server";

export const action = async ({ request }) => {
    const { supabaseClient: supabase } = createSupabaseServerClient(request);
    const { campaign_id, title, status, type, dial_type, group_household_queue, caller_id, start_date, end_date, voicemail_file, questions, workspace } = await request.json();
    let tableKey = type === 'live_call' ? 'live_campaign' : null;

    try {
        const { data: campaign, error: campaignError } = await supabase
            .from('campaign')
            .update({ title, status, type, dial_type, group_household_queue, caller_id, start_date, end_date, workspace,voicemail_file })
            .eq('id', campaign_id)
            .select();
            
        if (campaignError) {console.log(campaignError);throw campaignError}

        let campaignDetails = null;
        if (tableKey) {
            const { data: detailsData, error: campaignDetailsError } = await supabase
                .from(tableKey)
                .update({ questions, workspace })
                .eq('campaign_id', campaign_id)
                .select();
            if (campaignDetailsError) throw campaignDetailsError;
            campaignDetails = detailsData;
        }

        return json({ campaign, campaignDetails });
    } catch (error) {
        console.error("Error updating campaign:", error);
        return json({ error: error.message }, { status: 500 });
    }
}
