import { json } from "@remix-run/react";
import { getSupabaseServerClientWithSession } from "../lib/supabase.server";

export const action = async ({ request }) => {
    const { supabaseClient, headers } =
        await getSupabaseServerClientWithSession(request);

    const method = request.method;

    let response;
    if (method === 'DELETE'){
        const formData = await request.formData();
        const contactId = formData.get('contact_id');
        const audienceId = formData.get('audience_id');
    
        const {data: update, error: updateError} = await supabaseClient
        .from('contact_audience')
        .delete()
        .eq('contact_id', contactId)
        .eq('audience_id', audienceId);
        if (updateError) console.log(updateError)
            response = update
        }
    return json(response, {headers});
};
