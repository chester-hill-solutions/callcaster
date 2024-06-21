import Twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';

const createSubaccount = async ({ workspace_id }) => {
    const twilio = new Twilio.Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
    const account = await twilio.api.v2010.accounts.create({
        friendlyName: workspace_id
    }).catch((error) => {
        console.error('Error creating subaccount', error)
    });
    return account
};

const updateWorkspace = async ({ workspace_id, update }) => {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { data, error } = await supabase.from('workspace').update({ twilio_data: update }).eq('id', workspace_id).select().single();
    if (error) throw { workspace_error: error };
    return data;
}

export const action = async ({ request }) => {
    const { workspace_id } = await request.json();
    try {
        const update = await createSubaccount({ workspace_id });
        const updated = await updateWorkspace({ workspace_id, update });
        return new Response(JSON.stringify({ ...updated }), {
            headers: {
                "Content-Type": "application/json"
            },
            status: 200
        })
    } catch (error) {
        console.error('Subaccount failed', error);
        return new Response(JSON.stringify({ error }), {
            headers: {
                'Content-Type': 'application/json'
            },
            status: 500
        });
    }
}