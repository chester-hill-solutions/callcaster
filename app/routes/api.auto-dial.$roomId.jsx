import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";

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

    const { data: dbCall, error: callError } = await supabase.from('call').select('campaign_id, outreach_attempt_id, contact_id').eq('sid', formData.get('CallSid')).single();
    if (answeredBy && answeredBy.includes('machine') && !answeredBy.includes('other') && callStatus !== 'completed') {
        const { data: campaign, error: campaignError } = await supabase.from('campaign').select('voicemail_file, group_household_queue').eq('id', dbCall.campaign_id).single();
        if (campaign.group_household_queue) {
            const { data: contacts, error: householdContactsError } = await supabase.rpc('dequeue_household', { contact_id: dbCall.contact_id })
        } else {
            const { data: queueStatus, error: queueError } = await supabase.from('campaign_queue').update({ status: 'dequeued' }).eq('contact_id', dbCall.contact_id).select();
        }
        const { data: outreachStatus, error: outreachError } = await supabase.from('outreach_attempt').update({ disposition: 'voicemail' }).eq('id', dbCall.outreach_attempt_id).select();
        try { call.update({ twiml: `<Response><Pause length="5"/><Play>${campaign.voicemail_file}</Play></Response>` }) }
        catch (error) {
            console.log(error)
        }
    } else {
        const { data: attempt, error: attemptError } = await supabase.from('outreach_attempt').update({answered_at: new Date() }).eq('id', dbCall.outreach_attempt_id).select();
        dial.conference({
            //record: 'record-from-start',
            beep: false,
            statusCallback: `${process.env.BASE_URL}/api/auto-dial/status`,
            statusCallbackEvent: ['join', 'leave', 'modify'],
            endConferenceOnExit: false,
            maxParticipants: 10,
            waitUrl: '',
        }, conferenceName);
    }
    return new Response(twiml.toString(), {
        headers: {
            'Content-Type': 'text/xml'
        }
    });
};