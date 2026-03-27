import Twilio from "twilio";

export const loader = async () => {
    const twiml = new Twilio.twiml.VoiceResponse();

    twiml.say('Welcome to the phone verification system.');
    twiml.pause({ length: 1 });
    twiml.say('Please enter the 6 digit code shown on your screen');
    twiml.gather({
        numDigits: 6,
        action: `${process.env['BASE_URL']}/api/verify-pin-input`,
        method: 'POST',
        timeout: 30
    });

    return new Response(twiml.toString(), {
        headers: {
            'Content-Type': 'text/xml'
        }
    });
} 