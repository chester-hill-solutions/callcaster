import Twilio from 'twilio';
import { createSupabaseServerClient } from '../lib/supabase.server';

export const action = async ({ request }) => {
    const { supabaseClient: supabase, headers } = createSupabaseServerClient(request);
    const { to: toNumber, user_id, campaign_id, contact_id } = await request.json();
    const twilio = new Twilio.Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
    const twiml = new Twilio.twiml.VoiceResponse();

    try {
        const call = await twilio.calls.create({
            to: `client:${user_id}`,
            from: process.env.TWILIO_PHONE_NUMBER,
            url: `${process.env.BASE_URL}/api/dial/${encodeURIComponent(toNumber)}`,
        });

      const callData = {
            sid: call.sid,
            date_updated: call.dateUpdated,
            parent_call_sid: call.parentCallSid,
            account_sid: call.accountSid,
            to: toNumber,
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
            workspace: 'd915f70e-4f32-4f2f-984f-72e2064e8e3c' //TODO
        };
        Object.keys(callData).forEach(key => callData[key] === undefined && delete callData[key]);

        const { error } = await supabase.from('call').upsert({ ...callData });
        if (error) console.error('Error saving the call to the database:', error);
    } catch (error) {
        console.error('Error placing call:', error);
        twiml.say('There was an error placing your call. Please try again later.');
    }

    return new Response(twiml.toString(), {
        headers: {
            'Content-Type': 'text/xml'
        }
    });
}