import Twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';
import { createWorkspaceTwilioInstance } from '../lib/database.server';

// Function to normalize phone numbers
const normalizePhoneNumber = (input) => {
    let cleaned = input.replace(/[^0-9+]/g, '');

    if (cleaned.indexOf('+') > 0) {
        cleaned = cleaned.replace(/\+/g, '');
    }
    if (!cleaned.startsWith('+')) {
        cleaned = '+' + cleaned;
    }

    const validLength = 11;
    const minLength = 11;

    if (cleaned.length < minLength + 1) { // +1 for the +
        cleaned = '+1' + cleaned.replace('+', '');
    }

    if (cleaned.length !== validLength + 1) { // +1 for the +
        throw new Error('Invalid phone number length');
    }

    return cleaned;
};

// Function to create a call via Twilio
const createTwilioCall = async (twilio, to, caller_id, campaign_id, outreach_attempt_id) => {
    try {
        const call = await twilio.calls.create({
            to: to,
            from: caller_id,
            twiml: `<Response><Redirect>${process.env.BASE_URL}/api/ivr/${campaign_id}/</Redirect></Response>`,
            machineDetection: 'Enable',
            statusCallbackEvent: ['answered', 'completed'],
            statusCallback: `${process.env.BASE_URL}/api/ivr/status`
        });
        return call
    } catch (error) { console.error(error) };
};

// Function to create an outreach attempt via Supabase
const createOutreachAttempt = async (supabase, contact_id, campaign_id, queue_id, workspace_id, user_id) => {
    const { data, error } = await supabase.rpc('create_outreach_attempt', {
        con_id: contact_id,
        cam_id: campaign_id,
        queue_id,
        wks_id: workspace_id,
        usr_id: user_id
    });
    if (error) throw error;
    return data;
};

// Function to upsert call data into Supabase
const upsertCallData = async (supabase, callData) => {
    const { error } = await supabase.from('call').upsert(callData);
    if (error) throw error;
};

export const action = async ({ request }) => {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { to_number, user_id, campaign_id, workspace_id, queue_id, contact_id, caller_id } = await request.json();
    let to;
    try {
        to = normalizePhoneNumber(to_number);
    } catch (error) {
        console.error('Invalid phone number:', error);
        return new Response("<Response><Say>Invalid phone number provided. Please try again.</Say></Response>", {
            headers: {
                'Content-Type': 'text/xml'
            },
            status: 400
        });
    }
    
    const twilio = await createWorkspaceTwilioInstance({supabase, workspace_id});
    const twiml = new Twilio.twiml.VoiceResponse();

    try {

        const outreachAttempt = await createOutreachAttempt(supabase, contact_id, campaign_id, queue_id, workspace_id, user_id);
        const call = await createTwilioCall(twilio, to, caller_id, campaign_id, outreachAttempt);

        const callData = {
            sid: call.sid,
            date_updated: call.dateUpdated,
            parent_call_sid: call.parentCallSid,
            account_sid: call.accountSid,
            to: to_number,
            from: call.from,
            phone_number_sid: call.phoneNumberSid,
            status: call.status,
            start_time: call.startTime,
            end_time: call.endTime,
            duration: call.duration,
            price: call.price,
            direction: call.direction,
            answered_by: call.answeredBy,
            api_version: call.apiVersion,
            annotation: call.annotation,
            forwarded_from: call.forwardedFrom,
            group_sid: call.groupSid,
            caller_name: call.callerName,
            uri: call.uri,
            campaign_id: parseInt(campaign_id, 10),
            contact_id: parseInt(contact_id, 10),
            workspace: workspace_id,
            outreach_attempt_id: outreachAttempt
        };

        Object.keys(callData).forEach(key => callData[key] === undefined && delete callData[key]);

        await upsertCallData(supabase, callData);
    } catch (error) {
        console.error('Error processing call:', error);
        twiml.say('There was an error processing your call. Please try again later.');
    }

    return new Response(twiml.toString(), {
        headers: {
            'Content-Type': 'text/xml'
        }
    });
};
