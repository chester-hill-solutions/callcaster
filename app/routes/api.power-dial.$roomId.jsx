import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";
import { json } from "@remix-run/react";

export const action = async ({ request, params }) => {
    const conferenceName = params.roomId
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    const twilio = new Twilio.Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
    const twiml = new Twilio.twiml.VoiceResponse();
    const formData = await request.formData();
    const call = twilio.calls(formData.get('CallSid'));
    const answeredBy = formData.get('AnsweredBy');
    const callStatus = formData.get('CallStatus')

    const dial = twiml.dial();
    if (answeredBy && answeredBy.includes('machine') && !answeredBy.includes('other') && callStatus !== 'completed') {
        const { data: dbCall, error: callError } = await supabase.from('call').select('campaign_id, outreach_attempt_id').eq('sid', formData.get('CallSid')).single();
        const { data: campaign, error: campaignError } = await supabase.from('campaign').select('voicemail_file').eq('id', dbCall.campaign_id).single();
        const { data: outreachStatus, error: outreachError} = await supabase.from('outreach_attempt').update({disposition: 'voicemail'}).eq('id', dbCall.outreach_attempt_id).select();
        const {data: queueStatus, error: queueError} = await supabase.from('campaign_queue').update({status: 'dequeued'}).eq('contact_id', outreachStatus[0].contact_id).select();
        try { call.update({ twiml: `<Response><Pause length="5"/><Play>${campaign.voicemail_file}</Play></Response>` }) }
        catch (error) {
            console.log(error)
        }
    }

    dial.conference({
        record: 'record-from-start',
        beep: false,
        statusCallback: `${process.env.BASE_URL}/api/power-dial/status`,
        statusCallbackEvent: ['start', 'end', 'join', 'leave', 'modify'],
        endConferenceOnExit: true,
        maxParticipants: 10,
        waitUrl: '',
    }, conferenceName);

    return new Response(twiml.toString(), {
        headers: {
            'Content-Type': 'text/xml'
        }
    });
};