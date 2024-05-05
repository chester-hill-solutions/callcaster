import { createSupabaseServerClient } from '../supabase.server';
import { redirect, json } from '@remix-run/node';
import twilio from 'twilio'

export const loader = async ({ request }) => {
    const { supabaseClient: supabase, headers } = createSupabaseServerClient(request);
    const baseUrl = process.env.BASE_URL
    const voiceGrant = new twilio.jwt.AccessToken.VoiceGrant({
        outgoingApplicationSid: process.env.TWILIO_APP_SID,
        incomingAllow: true,
    });
    const token = new twilio.jwt.AccessToken(
        process.env.TWILIO_SID,
        process.env.TWILIO_API_KEY,
        process.env.TWILIO_API_SECRET,
        { identity: 'NJA' }
    )
    token.addGrant(voiceGrant)
    console.log(token)
    return json({ token: token.toJwt() });
}