import Twilio from "twilio";
import { createClient } from "@supabase/supabase-js";

export const action = async ({ request }: { request: Request }) => {
    const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
      );
    
    const formData = await request.formData();
    const digits = formData.get('Digits');
    const to = formData.get('To');

    const twiml = new Twilio.twiml.VoiceResponse();
    console.log(digits, to)
    if (!digits || !to) {
        twiml.say('Invalid request. Missing required parameters.');
        twiml.hangup();
        return new Response(twiml.toString(), {
            headers: { 'Content-Type': 'text/xml' }
        });
    }

    // Check if the PIN matches and hasn't expired
    const { data: verification, error } = await supabase
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
    const { data: userData, error: userError } = await supabase
        .from('user')
        .select('verified_audio_numbers')
        .eq('id', verification.user_id)
        .single();

    const verifiedNumbers = userData?.verified_audio_numbers || []; 
    const { error: updateError } = await supabase
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
    await supabase
        .from('phone_verification')
        .delete()
        .eq('id', verification.id);

    twiml.say('Your phone number has been successfully verified. You may now hang up.');
    twiml.hangup();

    return new Response(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml' }
    });
} 