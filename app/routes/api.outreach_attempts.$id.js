import { data as routeData } from "react-router";
import { safeParseJson } from "../lib/database.server";
import { createSupabaseServerClient } from "../lib/supabase.server";

export const action = async ({ request, params }) => {

    const { supabaseClient: supabase, headers } = createSupabaseServerClient(request);
    const { update } = await safeParseJson(request);
    const {id} = params;
    const { data, error } = await supabase.from('outreach_attempts').update(update).eq('id', id);
    if (error) return routeData({ error })
    return routeData(data,{headers})
}
