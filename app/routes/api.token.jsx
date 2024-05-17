import { json } from '@remix-run/node';
import twilio from 'twilio'

export const loader = async ({ request }) => {
    const url = new URL(request.url);
    const params = url.searchParams;
    const id = params.get('id');
    const voiceGrant = new twilio.jwt.AccessToken.VoiceGrant({
      outgoingApplicationSid: process.env.TWILIO_APP_SID,
      incomingAllow: true,
    });
    const token = new twilio.jwt.AccessToken(
      process.env.TWILIO_SID,
      process.env.TWILIO_API_KEY,
      process.env.TWILIO_API_SECRET,
      { identity: id }
    )
    
    token.addGrant(voiceGrant)
    return json({ token: token.toJwt() });
}