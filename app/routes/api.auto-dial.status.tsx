import { createClient, RealtimeChannel } from "@supabase/supabase-js";
import { json } from "@remix-run/react";
import { createWorkspaceTwilioInstance } from "../lib/database.server";
import { Tables } from "~/lib/database.types";
import { OutreachAttempt } from "~/lib/types";
import { Twilio } from "twilio";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

const updateCall = async (sid:string, update:Partial<Tables<"call">>) => {
    try {
        const { data, error } = await supabase.from('call').update(update).eq('sid', sid).select();
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error updating call:', error);
        throw error;
    }
};

const updateOutreachAttempt = async (id:string, update:Partial<OutreachAttempt>) => {
    try {
        const { data, error } = await supabase.from('outreach_attempt').update(update).eq('id', id).select();
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error updating outreach attempt:', error);
        throw error;
    }
};

const updateCampaignQueue = async (contactId:string, update:Partial<Tables<"campaign_queue">>) => {
    try {
        const { data, error } = await supabase.from('campaign_queue').update(update).eq('contact_id', contactId).select();
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error updating campaign queue:', error);
        throw error;
    }
};

const triggerAutoDialer = async (callData:Tables<"call">) => {
    try {
        const response = await fetch(`${process.env.BASE_URL}/api/auto-dial/dialer`, {
            method: 'POST',
            headers: { "Content-Type": 'application/json' },
            body: JSON.stringify({
                user_id: callData.conference_id,
                campaign_id: callData.campaign_id,
                workspace_id: callData.workspace,
                conference_id: callData.conference_id
            })
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
    } catch (error) {
        console.error('Error triggering auto dialer:', error);
        throw error;
    }
};

const handleCallStatus = async (parsedBody:{[x:string]:string}, dbCall:Tables<"call">, twilio:Twilio, realtime:RealtimeChannel, status:string) => {
    try {
        const callUpdate = await updateCall(parsedBody.CallSid, { end_time: new Date(parsedBody.Timestamp), status });
        const outreachStatus = await updateOutreachAttempt(callUpdate[0].outreach_attempt_id, { disposition: status });
        await updateCampaignQueue(outreachStatus[0].contact_id, { status: 'dequeued' });
        realtime.send({ type: "broadcast", event: "message", payload: { contact_id: outreachStatus[0].contact_id, status } });
        const conferences = await twilio.conferences.list({ friendlyName: callUpdate[0].conference_id, status: ['in-progress'] });
        if (conferences.length) {
            await triggerAutoDialer(dbCall);
        }
    } catch (error) {
        console.error('Error in handleCallStatus:', error);
        throw error;
    }
};

const handleParticipantLeave = async (parsedBody:{[x:string]:string}, twilio:Twilio, realtime:RealtimeChannel) => {
    try {
        const dbCall = await updateCall(parsedBody.CallSid, { end_time: new Date(parsedBody.Timestamp) });
        const outreachStatus = await updateOutreachAttempt(dbCall[0].outreach_attempt_id, { disposition: 'completed', ended_at: new Date() });
        await updateCampaignQueue(outreachStatus[0].contact_id, { status: 'dequeued' });
        realtime.send({ type: "broadcast", event: "message", payload: { contact_id: outreachStatus[0].contact_id, status: "completed" } });
        const conferences = await twilio.conferences.list({ friendlyName: parsedBody.FriendlyName, status: ['in-progress'] });
        await Promise.all(conferences.map(({ sid }) => twilio.conferences(sid).update({ status: "completed" })));
    } catch (error) {
        console.error('Error in handleParticipantLeave:', error);
        throw error;
    }
};

const handleParticipantJoin = async (parsedBody:{[x:string]:string}, dbCall:Tables<"call">, realtime:RealtimeChannel) => {
    try {
        if (!dbCall.conference_id) {
            await updateCall(parsedBody.CallSid, { conference_id: parsedBody.ConferenceSid, start_time: new Date(parsedBody.Timestamp) });
        }
        if (dbCall.outreach_attempt_id) {
            const outreachStatus = await updateOutreachAttempt(`${dbCall.outreach_attempt_id}`, { disposition: "in-progress", answered_at: new Date() });
            await updateCampaignQueue(outreachStatus[0].contact_id, { status: parsedBody.FriendlyName });
            realtime.send({ type: "broadcast", event: "message", payload: { contact_id: outreachStatus[0].contact_id, status: "connected" } });
        }
    } catch (error) {
        console.error('Error in handleParticipantJoin:', error);
        throw error;
    }
};

export const action = async ({ request }:{request:Request}) => {
    let realtime;
    try {
        const formData = await request.formData();
        const parsedBody = Object.fromEntries(formData) as {[x: string]:string};

        const { data: dbCall, error: callError } = await supabase.from('call').select().eq('sid', parsedBody.CallSid).single();
        if (callError) {
            throw new Error('Failed to fetch call data: ' + callError.message);
        }

        const twilio = await createWorkspaceTwilioInstance({ supabase, workspace_id: dbCall.workspace });
        realtime = supabase.channel(parsedBody.ConferenceSid);

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
                    await handleParticipantLeave(parsedBody, twilio, realtime);
                } else if (parsedBody.StatusCallbackEvent === 'participant-join') {
                    await handleParticipantJoin(parsedBody, dbCall, realtime);
                }
        }

        return json({ success: true });
    } catch (error) {
        console.error('Error processing action:', error);
        return json({ error: 'Failed to process action: ' + error.message }, { status: 500 });
    } finally {
        if (realtime) {
            supabase.removeChannel(realtime);
        }
    }
};