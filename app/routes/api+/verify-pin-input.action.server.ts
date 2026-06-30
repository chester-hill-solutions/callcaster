import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import Twilio from "twilio";

export const action = async ({ request }: { request: Request }) => {

    const client = createClient(
        env.BASE_URL(),
        env.BASE_URL(),
      );
    
    const formData = await request.formData();
    const digits = formData.get('Digits');
    const to = formData.get('To');

    const twiml = new Twilio.twiml.VoiceResponse();
    logger.debug("PIN verification request", { digits, to });
    if (!digits || !to) {
        twiml.say('Invalid request. Missing required parameters.');
        twiml.hangup();
        return new Response(twiml.toString(), {
            headers: { 'Content-Type': 'text/xml' }
        });
    }

    // Check if the PIN matches and hasn't expired
    const { data: verification, error } = await client
        .from('phone_verification')
        .select('*')
        .eq('phone_number', to as string)
        .eq('pin', digits as string)
        .gte('expires_at', new Date().toISOString())
        .single();
        
    if (error || !verification) {
        twiml.say('Invalid or expired verification code. Please try again.');
        twiml.hangup();
        return new Response(twiml.toString(), {
            headers: { 'Content-Type': 'text/xml' }
        });
    }
    const { data: userData, error: userError } = await client
        .from('user')
        .select('verified_audio_numbers')
        .eq('id', verification.user_id)
        .single();

    const verifiedNumbers = userData?.verified_audio_numbers || []; 
    const { error: updateError } = await client
        .from('user')
        .update({
            verified_audio_numbers: [...verifiedNumbers, to as string] 
        })
        .eq('id', verification.user_id);

    if (updateError) {
        twiml.say('An error occurred while verifying your number. Please try again later.');
        twiml.hangup();
        return new Response(twiml.toString(), {
            headers: { 'Content-Type': 'text/xml' }
        });
    }

    // Delete the verification record
    await client
        .from('phone_verification')
        .delete()
        .eq('id', verification.id);

    twiml.say('Your phone number has been successfully verified. You may now hang up.');
    twiml.hangup();

    return new Response(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml' }
    });
}
