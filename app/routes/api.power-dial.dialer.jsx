import Twilio from 'twilio';
import { createClient } from "@supabase/supabase-js";
export const action = async ({ request }) => {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    const { user_id, campaign_id, workspaceId } = await request.json();
    const twilio = new Twilio.Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
    try {
        const { data: contactRecord, error: contactError } = await supabase
            .from('campaign_queue')
            .select(
                `
          queue_id:id,
            ...contact!inner(contact_id:id,*)
          `,
            )
            .eq('status', 'queued')
            .eq('campaign_id', campaign_id)
            .limit(1);
        if (contactError) throw contactError;

        const toNumber = +19058088017//contactRecord.phone;


        let outreach_attempt_id;
        const { data: outreachAttempt, error: outreachError } = await supabase.rpc('create_outreach_attempt', { con_id: contactRecord[0].contact_id, cam_id: campaign_id, queue_id: contactRecord[0].queue_id });
        if (outreachError) throw outreachError;
        outreach_attempt_id = outreachAttempt;

        const call = await twilio.calls.create({
            to: toNumber,
            from: process.env.TWILIO_PHONE_NUMBER,
            url: `${process.env.BASE_URL}/api/power-dial/${user_id}`,
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
            campaign_id: parseInt(campaign_id, 10),
            contact_id: parseInt(contactRecord[0].id, 10),
            workspace: workspaceId,
            outreach_attempt_id
        };

        Object.keys(callData).forEach(key => callData[key] === undefined && delete callData[key]);

        const { error } = await supabase.from('call').upsert({ ...callData });
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
