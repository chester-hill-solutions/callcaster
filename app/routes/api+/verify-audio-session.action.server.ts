import { createSupabaseServerClient, verifyAuth } from "@/lib/supabase.server";
import { createWorkspaceTwilioInstance } from "@/lib/database.server";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { normalizePhoneNumber } from "@/lib/utils";
import Twilio from "twilio";

export const action = async ({ request }: { request: Request }) => {

    const twiml = new Twilio.twiml.VoiceResponse();
    
    twiml.say('Welcome to the phone verification system.');
    twiml.pause({ length: 1 });
    twiml.say('Please enter the 6 digit verification code shown on your screen.');
    
    twiml.gather({
        numDigits: 6,
        action: `${env.BASE_URL()}/api/verify-pin-input`,
        method: 'POST',
        timeout: 30
    });

    return new Response(twiml.toString(), {
        headers: {
            'Content-Type': 'text/xml'
        }
    });
}
