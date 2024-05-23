import { json } from "@remix-run/react";
import { getSupabaseServerClientWithSession } from "../lib/supabase.server";

export const action = async ({ request }) => {
    const { supabaseClient, headers } =
        await getSupabaseServerClientWithSession(request);
    const { callId, update } = await request.json();
    const { data, error } = await supabaseClient.from('call').update({ answers: update }).eq('sid', callId);
    if (error) return json({error})
    return json(data)
}