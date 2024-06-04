import { json } from '@remix-run/react';
import Twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';

function toUnderCase(str) {
    return str.replace(/(?!^)([A-Z])/g, '_$1').toLowerCase();
}

function convertKeysToUnderCase(obj) {
    const newObj = {};
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            newObj[toUnderCase(key)] = obj[key];
        }
    }
    return newObj;
}

export const action = async ({ request }) => {
    const formData = await request.formData();
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    const parsedBody = {};

    for (const pair of formData.entries()) {
        parsedBody[pair[0]] = pair[1];
    };
    
    const underCaseData = convertKeysToUnderCase(parsedBody);
    
    const updateData = {
        sid: underCaseData.call_sid,
        date_created: underCaseData.timestamp,
        date_updated: new Date().toISOString(),
        parent_call_sid: underCaseData.parent_call_sid,
        account_sid: underCaseData.account_sid,
        to: underCaseData.to,
        from: underCaseData.from,
        status: (underCaseData.call_status || underCaseData.status),
        start_time: underCaseData.start_time,
        end_time: underCaseData.end_time,
        duration: underCaseData.duration,
        direction: underCaseData.direction,
        api_version: underCaseData.api_version,
        forwarded_from: underCaseData.forwarded_from,
        caller_name: underCaseData.caller_name,
        price: underCaseData.price,
        campaign_id: underCaseData.campaign_id,
        organization: underCaseData.organization,
        contact_id: underCaseData.contact_id,
        call_duration: underCaseData.call_duration,
        recording_duration: underCaseData.recording_duration,
        recording_sid: underCaseData.recording_sid,
        recording_url: underCaseData.recording_url,
    };


    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);
    const { data, error } = await supabase.from('call').upsert(updateData, { onConflict: 'sid' }).select();
    
    return json({ success: true, data });
}