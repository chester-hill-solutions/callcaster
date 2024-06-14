import { json } from "@remix-run/node";
import { createSupabaseServerClient } from "../lib/supabase.server";

export const action = async ({ request }) => {

    const { supabaseClient: supabase, headers } = createSupabaseServerClient(request);
    const { campaign_id, contact_id, queue_id } = await request.json();

    const { data, error } = await supabase.rpc('create_outreach_attempt',
        {
            con_id: contact_id,
            cam_id: campaign_id,
            queue_id
        }
    );
    if (error) return json({ error })
    return json(data,{headers})
}
