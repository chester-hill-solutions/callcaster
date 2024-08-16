import { json } from "@remix-run/react";
import { getSupabaseServerClientWithSession } from "../lib/supabase.server";
import { SupabaseClient } from "@supabase/supabase-js";

interface SupabaseResponse {
    supabaseClient: SupabaseClient;
    headers: Headers;
}

interface AudienceData {
    id: string;
    [key: string]: string | number | boolean;
}

export const action = async ({ request }: { request: Request }) => {
    const { supabaseClient, headers }: SupabaseResponse =
        await getSupabaseServerClientWithSession(request);

    const method = request.method;

    let response: any;

    if (method === 'PATCH') {
        const formData = await request.formData();
        const data: AudienceData = { id: '' };
        for (let [key, value] of formData.entries()) {
            data[key] = value.toString();
        }

        const { data: update, error } = await supabaseClient
            .from('audience')
            .upsert(data)
            .eq('id', data.id)
            .select();
        response = update;
    }
    
    if (method === "DELETE") {
        const formData = await request.formData();
        const data: AudienceData = { id: '' };
        for (let [key, value] of formData.entries()) {
            data[key] = value.toString();
        }

        const { error } = await supabaseClient
            .from('audience')
            .delete()
            .eq('id', data.id);
        if (error){
            console.log(error);
        }
        response = { success: true };
    }
    
    return json(response, { headers });
};