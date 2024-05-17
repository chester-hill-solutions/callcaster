import { json } from '@remix-run/react';
import Twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';

function toUnderCase(str) {
    return str.replace(/(?!^)([A-Z])/g, '_$1').toLowerCase();
}


export const action = async ({ request }) => {
    const formData = await request.formData();
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    const parsedBody = {};

    for (const pair of formData.entries()) {
        parsedBody[pair[0]] = pair[1];
    };
    
    const updateData = {
        sid: parsedBody.CallSid,
        date_updated: new Date().toISOString(),
        parent_call_sid: parsedBody.ParentCallSid,
        account_sid: parsedBody.AccountSid,
        to: parsedBody.To,
        from: parsedBody.From,
        status: parsedBody.CallStatus,
        start_time: parsedBody.StartTime,
        end_time: parsedBody.EndTime,
        duration: parsedBody.Duration,
        direction: parsedBody.CallDirection,
        price: parsedBody.Price,
        recording_duration: parsedBody.RecordingDuration,
        recording_sid: parsedBody.RecordingSid,
        recording_url: parsedBody.RecordingUrl,
    };


    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);
    const { data, error } = await supabase.from('call').upsert({...updateData}, { onConflict: 'sid' }).select();


    console.log(data, error)

    return json({ success: true, data });
}