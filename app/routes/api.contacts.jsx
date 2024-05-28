import { json } from "@remix-run/react";
import { getSupabaseServerClientWithSession } from "../lib/supabase.server";

export const action = async ({ request }) => {
    const { supabaseClient, headers } =
        await getSupabaseServerClientWithSession(request);
    const data = await request.json();
    const { data: update, error } = await supabaseClient.from('contact').update(data).eq('id', data.id).select();
    return json(update)
}