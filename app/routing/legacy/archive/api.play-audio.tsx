import { createClient } from '@supabase/supabase-js';
import Twilio from 'twilio';
import type { ActionFunctionArgs } from "@remix-run/node";
import { logger } from "@/lib/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const twiml = new Twilio.twiml.VoiceResponse();
    try {
        const supabase = createClient(env.SUPABASE_URL(), env.SUPABASE_SERVICE_KEY());
        const formData = await request.formData();
        const CallSid = formData.get('CallSid') as string;
        const toNumber = formData.get('To') as string;
        const fromNumber = formData.get('From') as string;
        const baseUrl = env.BASE_URL();
        const audioUrl = 'https://aexsowqbtabkkyfthoav.supabase.co/storage/v1/object/public/nja/audio/VoteNate.wav?t=2024-05-03T13%3A19%3A35.648Z';
        twiml.pause({
            length: 1
        });
        twiml.play(audioUrl);
    } catch (error) {
        logger.error("Play audio error", error);
    }
    return new Response(twiml.toString(), {
        headers: {
            'Content-Type': 'text/xml'
        }
    });
}