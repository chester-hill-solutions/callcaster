import { createClient } from '@supabase/supabase-js';
import Twilio from 'twilio';

export const action = async ({ request }) => {
    const twiml = new Twilio.twiml.VoiceResponse();
    try {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SKEY);
        const formData = await request.formData();
        const CallSid = formData.get('CallSid');
        const toNumber = formData.get('To');
        const fromNumber = formData.get('From');
        const baseUrl = process.env.BASE_URL
        const audioUrl = 'https://aexsowqbtabkkyfthoav.supabase.co/storage/v1/object/public/nja/audio/VoteNate.wav?t=2024-05-03T13%3A19%3A35.648Z';
        twiml.pause({
            length: 1
        });
        twiml.play(audioUrl);
    } catch (error) {
        console.log(error)
    }
    return new Response(twiml.toString(), {
        headers: {
            'Content-Type': 'text/xml'
        }
    });
}