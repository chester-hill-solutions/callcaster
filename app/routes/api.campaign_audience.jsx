import { json } from "@remix-run/react";
import { getSupabaseServerClientWithSession } from "../lib/supabase.server";

export const action = async ({ request }) => {
    const { supabaseClient, headers } = await getSupabaseServerClientWithSession(request);
    let response;
    const method = request.method;
    if (method === 'PUT') {
        const data = await request.json();
        try {
            const { data: existing, error: lookupError } = await supabaseClient.from('campaign_audience').select().eq('campaign_id', data.campaign_id);
            if (lookupError) throw lookupError
            const toDelete = existing.filter((row) => !data.updated.some(updatedRow => updatedRow.id === row.id))
            const toAdd = data.updated.filter((updatedRow) => !existing.some(row => row.id === updatedRow.id));
            const { data: add, error: addError } = await supabaseClient.from('campaign_audience').insert(toAdd.map((row) => ({audience_id: row.id, campaign_id: data.campaign_id}))).select();
            if (addError) throw addError
            const { data: deleteData, error: deleteError } = await supabaseClient.from('campaign_audience').delete().in('audience_id', toDelete.map((row) => (row.audience_id)))
            if (deleteError) throw deleteError;
            response = { add, deleteData };
        } catch (error) {
            console.log(error)
            return json({ error: error.message }, { status: 400, headers });
        }
    }
    if (method === 'POST') {
        const data = await request.json();

        const { data: campaign_audience, error } = await supabaseClient
            .from('campaign_audience')
            .insert(data)
            .select();

        if (error) {
            return json({ error: error.message }, { status: 400, headers });
        }

        response = campaign_audience;
    }

    if (method === 'DELETE') {
        const { audience_id } = await request.json();

        const { data: removal, error } = await supabaseClient
            .from('campaign_audience')
            .delete()
            .eq('audience_id', audience_id);

        if (error) {
            return json({ error: error.message }, { status: 400, headers });
        }

        response = removal;
    }

    return json({ ...response }, { headers });
};