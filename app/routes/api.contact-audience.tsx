import { json } from "@remix-run/react";
import { verifyAuth } from "../lib/supabase.server";

export const action = async ({ request }: { request: Request }) => {
    const { supabaseClient, headers } =
        await verifyAuth(request);

    const method = request.method;

    let response;
    if (method === 'DELETE'){
        const formData = await request.formData();
        const contactId = formData.get('contact_id') as string;
        const audienceId = formData.get('audience_id') as string;
    
        const {data: update, error: updateError} = await supabaseClient
        .from('contact_audience')
        .delete()
        .eq('contact_id', Number(contactId))
        .eq('audience_id', Number(audienceId));
        if (updateError) console.log(updateError)
            response = update
        }
    return json(response, {headers});
};
