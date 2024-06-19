import Twilio from 'twilio';
import { createSupabaseServerClient } from '../lib/supabase.server';

export const action = async ({ request }) => {
    const { supabaseClient: supabase, headers } = createSupabaseServerClient(request);
    const { user_id, caller_id, campaign_id, workspace_id } = await request.json();
    const twilio = new Twilio.Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
    const conferenceName = user_id;
    try {
        const call = await twilio.calls.create({
            to: `client:${user_id}`,
            from: caller_id,
            url: `${process.env.BASE_URL}/api/auto-dial/${conferenceName}`
        });

        const callData = {
            sid: call.sid,
            date_updated: call.dateUpdated,
            parent_call_sid: call.parentCallSid,
            account_sid: call.accountSid,
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
            workspace: workspace_id,
            conference_id: user_id
        };

        Object.keys(callData).forEach(key => callData[key] === undefined && delete callData[key]);
        const { error } = await supabase.from('call').upsert({ ...callData }).select();
        if (error) console.error('Error saving the call to the database:', error);

        return new Response(JSON.stringify({ success: true, conferenceName }), {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        console.error('Error starting conference:', error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }
};
