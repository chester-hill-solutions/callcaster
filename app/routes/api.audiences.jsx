import { json } from "@remix-run/react";
import { getSupabaseServerClientWithSession } from "../lib/supabase.server";

export const action = async ({ request }) => {
    const { supabaseClient, headers } =
        await getSupabaseServerClientWithSession(request);

    const method = request.method;

    let response;

    if (method === 'PATCH') {
        const formData = await request.formData();
        const data = {}
        for (let pair of formData.entries()){
            data[pair[0]] = pair[1];
        }
        const { data: update, error } = await supabaseClient
            .from('audience')
            .update(data)
            .eq('id', data.id)
            .select();
        response = update;
        console.log(update, error)
    }

    return json(response, {headers});
};
