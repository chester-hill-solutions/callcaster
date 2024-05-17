import Twilio from 'twilio';

export const action = async ({ request, params }) => {
    const twiml = new Twilio.twiml.VoiceResponse();
    const number = params.number;
    const dial = twiml.dial({
        callerId: process.env.TWILIO_PHONE_NUMBER,
        record: 'record-from-answer',
        recordingStatusCallbackEvent: 'in-progress'
    })
    dial.number({
        machineDetection: 'Enable',
        amdStatusCallback: `${process.env.BASE_URL}/api/dial/status`,
        statusCallback: '/api/call-status/',
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    }, number);
    return new Response(twiml.toString(), {
        headers: {
            'Content-Type': 'text/xml'
        }
    });
}