import { json } from "@remix-run/node";
import { createSupabaseServerClient } from "../lib/supabase.server";

export const action = async ({ request, params }) => {

    const { supabaseClient: supabase, headers } = createSupabaseServerClient(request);
    const { update } = await request.json();
    const {id} = params;
    const { data, error } = await supabase.from('outreach_attempts').update(update).eq('id', id);
    if (error) return json({ error })
    return json(data,{headers})
}
