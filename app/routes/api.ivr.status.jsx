import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";
import { json } from "@remix-run/react";

const getCampaignData = async (supabase, campaign_id) => {
    const { data: campaign, error } = await supabase
        .from('ivr_campaign')
        .select()
        .eq('campaign_id', campaign_id)
        .single();
    if (error) throw error;
    return campaign;
};

const updateResult = async (supabase, outreach_attempt_id, update) => {
    const { error } = await supabase
        .from('outreach_attempt')
        .update(update)
        .eq('id', outreach_attempt_id);
    if (error) throw error;
};

const updateCallStatus = async (supabase, callSid, status, timestamp) => {
    const { error } = await supabase
        .from('call')
        .update({ end_time: new Date(timestamp), status })
        .eq('sid', callSid);
    if (error) throw error;
};

const handleVoicemail = async (twilio, callSid, dbCall, campaign, supabase) => {
    const call = twilio.calls(callSid);
    await updateResult(supabase, dbCall.outreach_attempt_id, { disposition: 'voicemail' });
    const step = campaign.stepData.find((i) => i.step === 'voicemail');
    if (!step) {
        await call.update({
            twiml: `<Response><Hangup/></Response>`
        });
    } else {
        if (step.speechType === 'synthetic') {
            await call.update({
                twiml: `<Response><Pause length="1"/><Say>${step.say}</Say></Response>`
            });
        } else {
            const { data, error } = await supabase.storage
                .from(`workspaceAudio`)
                .createSignedUrl(`${dbCall.workspace}/${campaign.voicemail_file}`, 3600);
            if (error) throw {'Status_Error': error};
            await call.update({
                twiml: `<Response><Pause length="1"/><Play>${data.signedUrl}</Play></Response>`
            });
        }
    }
};

const handleCallStatusUpdate = async (supabase, callSid, status, timestamp, outreach_attempt_id, disposition) => {
    await Promise.all([
        updateCallStatus(supabase, callSid, status, timestamp),
        updateResult(supabase, outreach_attempt_id, { disposition })
    ]);
};

export const action = async ({ request }) => {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const twilio = new Twilio.Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
    const formData = await request.formData();
    
    const parsedBody = Object.fromEntries(formData.entries());
    const callSid = parsedBody.CallSid;

    try {
        const { data: dbCall, error: callError } = await supabase
            .from('call')
            .select('campaign_id, outreach_attempt_id, workspace')
            .eq('sid', callSid)
            .single();
        if (callError) throw callError;

        const callStatus = parsedBody.CallStatus;
        const timestamp = parsedBody.Timestamp;

        if (callStatus === 'failed' || callStatus === 'no-answer') {
            const disposition = callStatus === 'failed' ? 'failed' : 'no-answer';
            await handleCallStatusUpdate(supabase, callSid, callStatus, timestamp, dbCall.outreach_attempt_id, disposition);
        } else if (parsedBody.AnsweredBy && parsedBody.AnsweredBy.includes('machine') && !parsedBody.AnsweredBy.includes('other') && callStatus !== 'completed') {
            const campaign = await getCampaignData(supabase, dbCall.campaign_id);
            await handleVoicemail(twilio, callSid, dbCall, campaign, supabase);
        } else if (callStatus === 'completed'){
            await handleCallStatusUpdate(supabase, callSid, callStatus, timestamp, dbCall.outreach_attempt_id, 'completed');
        }
    } catch (error) {
        console.error(error);
        return json({ success: false, error });
    }
    return json({ success: true });
};
