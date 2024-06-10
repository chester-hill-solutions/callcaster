import Twilio from 'twilio';
import { createSupabaseServerClient } from '../lib/supabase.server';

export const action = async ({ request }) => {
    const { supabaseClient: supabase, headers } = createSupabaseServerClient(request);
    const { user_id, caller_id } = await request.json();
    const twilio = new Twilio.Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
    const conferenceName = user_id;

    try {
        const call = await twilio.calls.create({
            to: `client:${user_id}`,
            from: caller_id,
            url: `${process.env.BASE_URL}/api/auto-dial/${conferenceName}`
        });
    
        return new Response(JSON.stringify({ success: true, conferenceName }), {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        console.error('Error starting conference:', error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }
};
