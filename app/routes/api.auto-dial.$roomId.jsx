import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";
import { createWorkspaceTwilioInstance } from "../lib/database.server";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);


const fetchCallData = async (callSid) => {
    const { data, error } = await supabase.from('call').select('campaign_id, outreach_attempt_id, contact_id, workspace').eq('sid', callSid).single();
    if (error) throw new Error(`Error fetching call data: ${error.message}`);
    return data;
};

const fetchCampaignData = async (campaignId) => {
    const { data, error } = await supabase.from('campaign').select('voicemail_file, group_household_queue').eq('id', campaignId).single();
    if (error) throw new Error(`Error fetching campaign data: ${error.message}`);
    return data;
};

const getVoicemailSignedUrl = async (workspace, voicemailFile) => {
    if (!voicemailFile) return null;
    const { data, error } = await supabase.storage.from('workspaceAudio').createSignedUrl(`${workspace}/${voicemailFile}`, 3600);
    if (error) throw new Error(`Error fetching voicemail file: ${error.message}`);
    return data.signedUrl;
};

const dequeueContact = async (contactId, groupOnHousehold) => {
    if (groupOnHousehold) {
        const { data, error } = await supabase.rpc('dequeue_contact', { passed_contact_id: contactId, group_on_household: true });
        if (error) throw new Error(`Error dequeueing household: ${error.message}`);
        return data;
    } else {
        const { data, error } = await supabase.from('campaign_queue').update({ status: 'dequeued' }).eq('contact_id', contactId).select();
        if (error) throw new Error(`Error updating queue status: ${error.message}`);
        return data;
    }
};

const updateOutreachAttempt = async (attemptId, update) => {
    const { data, error } = await supabase.from('outreach_attempt').update(update).eq('id', attemptId).select();
    if (error) throw new Error(`Error updating outreach attempt: ${error.message}`);
    return data;
};

const triggerAutoDialer = async (userId, campaignId, workspaceId) => {
    await fetch(`${process.env.BASE_URL}/api/auto-dial/dialer`, {
        method: 'POST',
        headers: { "Content-Type": 'application/json' },
        body: JSON.stringify({ user_id: userId, campaign_id: campaignId, workspace_id: workspaceId })
    });
};

const handleAnsweringMachine = async (call, dbCall, campaign, signedUrl, outreachStatus) => {
    const twiml = new Twilio.twiml.VoiceResponse();

    await dequeueContact(dbCall.contact_id, campaign.group_household_queue);
    await updateOutreachAttempt(dbCall.outreach_attempt_id, { disposition: 'voicemail' });

    const conferences = await call.conferences.list({ friendlyName: outreachStatus[0].user_id, status: 'in-progress' });

    if (conferences.length) {
        await triggerAutoDialer(outreachStatus[0].user_id, outreachStatus[0].campaign_id, dbCall.workspace);
    }

    const playTwiml = signedUrl
        ? `<Response><Pause length="5"/><Play>${signedUrl}</Play></Response>`
        : `<Response><Hangup/></Response>`;

    await call.update({ twiml: playTwiml });

    return new Response(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml' }
    });
};

const handleHumanAnswer = async (dbCall, conferenceName, called) => {
    const twiml = new Twilio.twiml.VoiceResponse();

    if (dbCall.outreach_attempt_id && !called.startsWith('client')) {
        await updateOutreachAttempt(dbCall.outreach_attempt_id, { answered_at: new Date() });
    }

    const dial = twiml.dial();
    dial.conference({
        beep: false,
        statusCallback: `${process.env.BASE_URL}/api/auto-dial/status`,
        statusCallbackEvent: ['join', 'leave', 'modify'],
        endConferenceOnExit: false,
        maxParticipants: 2,
        waitUrl: '',
    }, conferenceName);

    return new Response(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml' }
    });
};

export const action = async ({ request, params }) => {
    const conferenceName = params.roomId;
    const realtime = supabase.realtime.channel(conferenceName).subscribe()
    const formData = await request.formData();
    const callSid = formData.get('CallSid');
    const answeredBy = formData.get('AnsweredBy');
    const callStatus = formData.get('CallStatus');
    const called = formData.get('Called');

    try {
        const dbCall = await fetchCallData(callSid);
        const twilio = await createWorkspaceTwilioInstance({ supabase, workspace_id: dbCall.workspace });
        const call = twilio.calls(callSid);
        realtime.send("broadcast", { contact: dbCall.contact_id, status: callStatus})
        if (answeredBy && answeredBy.includes('machine') && !answeredBy.includes('other') && callStatus !== 'completed') {
            const campaign = await fetchCampaignData(dbCall.campaign_id);
            const signedUrl = await getVoicemailSignedUrl(dbCall.workspace, campaign.voicemail_file);
            const outreachStatus = await updateOutreachAttempt(dbCall.outreach_attempt_id, { disposition: 'voicemail' });
            return await handleAnsweringMachine(call, dbCall, campaign, signedUrl, outreachStatus);
        } else {
            return await handleHumanAnswer(dbCall, conferenceName, called);
        }
    } catch (error) {
        console.error('General error:', error);
        return new Response(`<Response><Hangup/></Response>`, {
            headers: { 'Content-Type': 'text/xml' }
        });
    }
};