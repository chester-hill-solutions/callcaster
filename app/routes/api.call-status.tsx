import { json } from '@remix-run/react';
import { createClient } from '@supabase/supabase-js';

function toUnderCase(str: string) {
    return str.replace(/(?!^)([A-Z])/g, '_$1').toLowerCase();
}

function convertKeysToUnderCase(obj: any) {
    const newObj: { [key: string]: any } = {};
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            newObj[toUnderCase(key)] = obj[key];
        }
    }
    return newObj;
}

export const action = async ({ request }: { request: Request }) => {
    const formData = await request.formData();
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    const userId = formData.get('CalledVia').split(":")[1];
    const realtime = supabase.realtime.channel(userId)
    const parsedBody: { [key: string]: string } = {};

    for (const pair of formData.entries()) {
        parsedBody[pair[0]] = pair[1];
    }

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
        duration: Math.max(Number(underCaseData.duration), Number(underCaseData.call_duration)),
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
    if (error) {
        console.error('Error updating call:', error);
        return json({ success: false, error: 'Failed to update call' }, { status: 500 });
    }
    const { data: currentAttempt, error: fetchError } = await supabase
        .from('outreach_attempt')
        .select('disposition, contact_id, workspace')
        .eq('id', data[0].outreach_attempt_id)
        .single();
    if (fetchError) {
        console.error('Error fetching current attempt:', fetchError);
        return json({ success: false, error: 'Failed to fetch current attempt' }, { status: 500 });
    }
    realtime.send({
        type: "broadcast", event: "message", payload: {
            contact_id: currentAttempt.contact_id,
            status: underCaseData.call_status
        }
    });
    
    if (["initiated", "ringing", "in-progress", "idle"].includes(underCaseData.call_status)) {
        const updateData: any = { disposition: underCaseData.call_status };
        
        // Set answered_at when call is answered (in-progress status)
        if (underCaseData.call_status === 'in-progress') {
            updateData.answered_at = new Date().toISOString();
        }
        
        const { data: updateAttempt, error: updateError } = await supabase
            .from('outreach_attempt')
            .update(updateData)
            .eq('id', data[0].outreach_attempt_id)
            .select();

        if (updateError) {
            console.error('Error updating attempt:', updateError);
            return json({ success: false, error: 'Failed to update attempt' }, { status: 500 });
        }
    }
    
    // Update ended_at when call is completed, failed, no-answer, or busy
    if (["completed", "failed", "no-answer", "busy", "canceled"].includes(underCaseData.call_status)) {
        const { error: endTimeError } = await supabase
            .from('outreach_attempt')
            .update({ 
                ended_at: new Date().toISOString(),
                disposition: underCaseData.call_status
            })
            .eq('id', data[0].outreach_attempt_id);

        if (endTimeError) {
            console.error('Error updating attempt end time:', endTimeError);
        }
    }
    const onePerSixty = (duration) => {
        return Math.floor(duration / 60) + 1;
    }
    if (["completed", "failed", "no-answer", "busy"].includes(underCaseData.call_status)) {
        const billingUnits = onePerSixty(Math.max(Number(underCaseData.duration), Number(underCaseData.call_duration)));
        const { data: transaction, error: transactionError } = await supabase.from('transaction_history').insert({
            workspace: currentAttempt.workspace,
            type: "DEBIT",
            amount: -billingUnits,
            note: `Call ${updateData.sid}, Contact ${currentAttempt.contact_id}, Outreach Attempt ${currentAttempt.id}`
        }).select();
        if (transactionError) {
            console.error('Error creating transaction:', transactionError);
            return json({ success: false, error: 'Failed to create transaction' }, { status: 500 });
        }
        console.log("transaction", transaction)
    }
    return json({ success: true })
}