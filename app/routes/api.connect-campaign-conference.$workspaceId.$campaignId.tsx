import VoiceResponse from "twilio/lib/twiml/VoiceResponse.js";

export const loader = async ({ params }: { params: { workspaceId: string, campaignId: string } }) => {
    const twiml = new VoiceResponse();
    
    twiml.say('Welcome to the campaign. You will be connected to calls through your phone.');
    twiml.pause({ length: 1 });

    // Connect to the campaign conference
    const dial = twiml.dial();
    dial.conference({
        statusCallback: `${process.env.BASE_URL}/api/conference-events`,
        statusCallbackEvent: ['join', 'leave', 'end', 'start'],
        endConferenceOnExit: true,
        waitUrl: 'http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical',
        startConferenceOnEnter: true,
        beep: 'onEnter',
        record: 'record-from-start',
    }, `campaign-${params.workspaceId}-${params.campaignId}`);

    return new Response(twiml.toString(), {
        headers: {
            'Content-Type': 'text/xml'
        }
    });
} 