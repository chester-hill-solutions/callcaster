import Twilio from 'twilio';
import { createClient } from "@supabase/supabase-js";
export const action = async ({ request }) => {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    const { user_id, campaign_id, workspace_id, conference_id } = await request.json();
    const twilio = new Twilio.Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
    try {
        const { data: record, error: contactError } = await supabase
            .rpc('auto_dial_queue',
                {
                    campaign_id_variable: campaign_id, user_id_variable: user_id

                })
        if (contactError) throw contactError;
        const contactRecord = record[0];
        const toNumber = +19058088017//contactRecord.phone;

        let outreach_attempt_id;
        const { data: outreachAttempt, error: outreachError } = await supabase.rpc('create_outreach_attempt', { con_id: contactRecord.contact_id, cam_id: campaign_id, queue_id: contactRecord.queue_id });
        if (outreachError) throw outreachError;
        outreach_attempt_id = outreachAttempt;

        const call = await twilio.calls.create({
            to: toNumber,
            from: contactRecord.caller_id,
            url: `${process.env.BASE_URL}/api/auto-dial/${user_id}`,
            machineDetection: 'Enable',
            statusCallbackEvent: ['answered', 'completed']
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
            campaign_id: campaign_id,
            contact_id: contactRecord.contact_id,
            workspace: workspace_id,
            outreach_attempt_id,
            conference_id
        };

        Object.keys(callData).forEach(key => callData[key] === undefined && delete callData[key]);
        const { error } = await supabase.from('call').upsert({ ...callData }).select();
        if (error) console.error('Error saving the call to the database:', error);
        return new Response(JSON.stringify({ success: true }), {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        console.error('Error dialing number:', error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }
};
