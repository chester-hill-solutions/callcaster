import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";
import { json } from "@remix-run/react";
import { createWorkspaceTwilioInstance } from "../lib/database.server";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const updateCall = async (sid, update) => {
    const { data, error } = await supabase.from('call').update(update).eq('sid', sid).select();
    if (error) console.error('Error updating call:', error);
    return data;
};

const updateOutreachAttempt = async (id, update) => {
    const { data, error } = await supabase.from('outreach_attempt').update(update).eq('id', id).select();
    if (error) console.error('Error updating outreach attempt:', error);
    return data;
};

const updateCampaignQueue = async (contactId, update) => {
    const { data, error } = await supabase.from('campaign_queue').update(update).eq('contact_id', contactId).select();
    if (error) console.error('Error updating campaign queue:', error);
    return data;
};

const triggerAutoDialer = async (callData) => {
    try {
        await fetch(`${process.env.BASE_URL}/api/auto-dial/dialer`, {
            method: 'POST',
            headers: { "Content-Type": 'application/json' },
            body: JSON.stringify({
                user_id: callData.conference_id,
                campaign_id: callData.campaign_id,
                workspace_id: callData.workspace,
                conference_id: callData.conference_id
            })
        });
    } catch (error) {
        console.error('Error triggering auto dialer:', error);
    }
};

const handleCallStatus = async (parsedBody, dbCall, twilio, realtime, status) => {
    const callUpdate = await updateCall(parsedBody.CallSid, { end_time: new Date(parsedBody.Timestamp), status });
    const outreachStatus = await updateOutreachAttempt(dbCall.outreach_attempt_id, { disposition: status });
    await updateCampaignQueue(outreachStatus[0].contact_id, { status: 'dequeued' });
    realtime.send("broadcast", { contact_id: outreachStatus[0].contact_id, status });

    const conferences = await twilio.conferences.list({ friendlyName: callUpdate[0].conference_id, status: ['in-progress'] });
    if (conferences.length) {
        await triggerAutoDialer(dbCall);
    }
};

const handleParticipantLeave = async (parsedBody, dbCall, twilio, realtime) => {
    await updateCall(parsedBody.CallSid, { end_time: new Date(parsedBody.Timestamp) });
    const outreachStatus = await updateOutreachAttempt(dbCall.outreach_attempt_id, { disposition: 'completed', ended_at: new Date() });
    await updateCampaignQueue(outreachStatus[0].contact_id, { status: 'dequeued' });
    realtime.send("broadcast", { contact_id: outreachStatus[0].contact_id, status: "completed" });

    const conferences = await twilio.conferences.list({ friendlyName: parsedBody.FriendlyName, status: ['in-progress'] });
    await Promise.all(conferences.map(({ sid }) => twilio.conferences(sid).update({ status: "completed" })));
};

const handleParticipantJoin = async (parsedBody, dbCall, realtime) => {
    if (!dbCall.conference_id) {
        await updateCall(parsedBody.CallSid, { conference_id: parsedBody.ConferenceSid, start_time: new Date(parsedBody.Timestamp) });
    }
    if (dbCall.outreach_attempt_id) {
        const outreachStatus = await updateOutreachAttempt(dbCall.outreach_attempt_id, { disposition: "in-progress", answered_at: new Date() });
        await updateCampaignQueue(outreachStatus[0].contact_id, { status: parsedBody.FriendlyName });
        realtime.send("broadcast", { contact_id: outreachStatus.contact_id, status: "connected" });
    }
};
export const action = async ({ request }) => {
    const formData = await request.formData();
    const parsedBody = Object.fromEntries(formData);

    const { data: dbCall, error: callError } = await supabase.from('call').select().eq('sid', parsedBody.CallSid).single();
    if (callError) {
        console.error('Failed to fetch call data:', callError);
        return json({ error: 'Failed to fetch call data' }, { status: 500 });
    }

    const twilio = await createWorkspaceTwilioInstance({ supabase, workspace_id: dbCall.workspace });
    const realtime = supabase.realtime.channel(parsedBody.ConferenceSid).subscribe();

    try {
        switch (parsedBody.CallStatus) {
            case 'failed':
            case 'busy':
            case 'no-answer':
                await handleCallStatus(parsedBody, dbCall, twilio, realtime, parsedBody.CallStatus.toLowerCase());
                break;
            default:
                if (parsedBody.StatusCallbackEvent === 'participant-leave' &&
                    (parsedBody.ReasonParticipantLeft === 'participant_updated_via_api' ||
                        parsedBody.ReasonParticipantLeft === 'participant_hung_up')) {
                    await handleParticipantLeave(parsedBody, dbCall, twilio, realtime);
                } else if (parsedBody.StatusCallbackEvent === 'participant-join') {
                    await handleParticipantJoin(parsedBody, dbCall, realtime);
                }
        }
        return json({ success: true });
    } catch (error) {
        console.error('Error processing action:', error);
        return json({ error: 'Failed to process action' }, { status: 500 });
    }
};
