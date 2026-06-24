import { createSupabaseServerClient } from "@/lib/supabase.server";
import { createWorkspaceTwilioInstance } from "@/lib/database.server";
import { data as routeData } from "react-router";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { normalizePhoneNumber } from "@/lib/utils";
import Twilio from "twilio";
import { getAuthSupabaseClient, requireJsonAuth } from "@/lib/api-auth.server";

export const loader = async ({ request }: { request: Request }) => {

    const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;
  const { headers } = createSupabaseServerClient(request);
  const supabase = getAuthSupabaseClient(auth);
  const user = auth.user;
    const url = new URL(request.url);
    const workspace_id = url.searchParams.get('workspace_id') as string;
    const twilio = await createWorkspaceTwilioInstance({ supabase: supabase, workspace_id });
    
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
        return routeData({ error: verificationError.message }, { status: 500 });
    }

    try {
        // Call the user's phone with the verification PIN
        const call = await twilio.calls.create({
            to: phoneNumber,
            from: fromNumber,
            url: `${env.BASE_URL()}/api/verify-audio-pin/${verificationData.pin}`,
            method: 'GET',
        });

        return routeData({ 
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
            
        return routeData({ error: error.message }, { status: 500 });
    }
}
