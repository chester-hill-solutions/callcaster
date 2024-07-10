import Twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';

export const loader = async ({ request }) => {
    const twilio = new Twilio.Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
    const url = new URL(request.url);
    const params = url.searchParams;
    const areaCode = params.get('areaCode')
    try {
        const locals = await twilio.availablePhoneNumbers('CA').local.list({
            areaCode,
            limit: 10
        })
        return new Response(JSON.stringify(locals), {
            headers: {
                "Content-Type": "application/json"
            },
            status: 200
        })

    } catch (error) {
        console.error('Fetching numbers failed', error);
        return new Response(JSON.stringify({ error }), {
            headers: {
                'Content-Type': 'application/json'
            },
            status: 500
        });
    }
}

export const action = async ({ request }) => {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const formData = await request.formData();
    const { phoneNumber, workspace_id } = Object.fromEntries(formData);
    try {
        const { data, error } = await supabase.from('workspace').select('twilio_data').eq('id', workspace_id).single();
        if (error) throw error;
        const twilio = new Twilio.Twilio(data.twilio_data.sid, data.twilio_data.authToken);
        const number = await twilio.incomingPhoneNumbers.create({
            phoneNumber,
            statusCallback: `${process.env.BASE_URL}/api/caller-id/status`,
            voiceUrl: `${process.env.BASE_URL}/api/inbound`
        });
        const { data: newNumber, error: newNumberError } = await supabase
        .from('workspace_number')
        .insert({
            workspace: workspace_id,
            friendly_name: number.friendlyName,
            phone_number: number.phoneNumber,
            capabilities: number.capabilities,
            type:"rented"
        })
        .select().single();
        if (newNumberError) throw newNumberError;
        return new Response(JSON.stringify({ newNumber }), {
            headers: {
                "Content-Type": "application/json"
            },
            status: 201
        })
    } catch (error) {
        console.error('Failed to register number', error);
        return new Response(JSON.stringify({ error }), {
            headers: {
                'Content-Type': 'application/json'
            },
            status: 500
        });

    }
}