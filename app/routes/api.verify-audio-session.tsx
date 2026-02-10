import { json } from "@remix-run/node";
import { createSupabaseServerClient, verifyAuth } from "@/lib/supabase.server";
import Twilio from "twilio";
import { createWorkspaceTwilioInstance } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { env } from "@/lib/env.server";


function normalizePhoneNumber(input: string) {
    let cleaned = input.replace(/[^0-9+]/g, '');

    if (cleaned.indexOf('+') > 0) {
        cleaned = cleaned.replace(/\+/g, '');
    }
    if (!cleaned.startsWith('+')) {
        cleaned = '+' + cleaned;
    }

    const validLength = 11;
    const minLength = 11;

    if (cleaned.length < minLength + 1) { // +1 for the +
        cleaned = '+1' + cleaned.replace('+', '');
    }

    if (cleaned.length !== validLength + 1) { // +1 for the +
        throw new Error('Invalid phone number length');
    }

    return cleaned;
}
export const loader = async ({ request }: { request: Request }) => {
    const { supabaseClient: supabase, headers, user } = await verifyAuth(request);
    if (!user) {
        return json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = new URL(request.url);
    const workspace_id = url.searchParams.get('workspace_id') as string;
    const twilio = await createWorkspaceTwilioInstance({ supabase, workspace_id });
    
    const twiml = new Twilio.twiml.VoiceResponse();
    const phoneNumber = normalizePhoneNumber(url.searchParams.get('phoneNumber') as string)
    const fromNumber = normalizePhoneNumber(url.searchParams.get('fromNumber') as string)
    // Generate a 6-digit PIN
    const sixDigitPin = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store the PIN temporarily for verification
    const { data: verificationData, error: verificationError } = await supabase
        .from('phone_verification')
        .insert({
            user_id: user.id,
            phone_number: phoneNumber,
            pin: sixDigitPin,
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes expiry
        })
        .select()
        .single();
    if (verificationError) {
        return json({ error: verificationError.message }, { status: 500 });
    }

    try {
        // Call the user's phone with the verification PIN
        const call = await twilio.calls.create({
            to: phoneNumber,
            from: fromNumber,
            url: `${env.BASE_URL()}/api/verify-audio-pin/${verificationData.pin}`,
            method: 'GET',
        });

        return json({ 
            success: true, 
            verificationId: verificationData.id,
            callSid: call.sid,
            pin: verificationData.pin
        }, { headers });
    } catch (error: any) {
        logger.error('Error initiating verification call:', error);
        
        // Clean up the verification record if call fails
        await supabase
            .from('phone_verification')
            .delete()
            .eq('id', verificationData.id);
            
        return json({ error: error.message }, { status: 500 });
    }
}

// Handle the TwiML response for the verification call
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
    