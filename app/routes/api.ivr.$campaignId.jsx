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

const handleVoicemail = async (twilio, callSid, dbCall, campaign, supabase) => {
    const call = twilio.calls(callSid);
    await updateResult(supabase, dbCall.outreach_attempt_id, { disposition: 'voicemail' });

    const step = campaign.step_data.find((i) => i.step === 'voicemail');
    if (!step) {
        await call.update({
            twiml: `<Response><Hangup/></Response>`
        });
    } else {
        if (step.speechType === 'synthetic') {
            await call.update({
                twiml: `<Response><Pause length="5"/><Say>${step.say}</Say></Response>`
            });
        } else {
            const { data, error } = await supabase.storage
                .from(`workspaceAudio`)
                .createSignedUrl(`${dbCall.workspace}/${step.say}`, 3600);
            if (error) throw {'Campaign':error}
            await call.update({
                twiml: `<Response><Pause length="5"/><Play>${data.signedUrl}</Play></Response>`
            });
        }
    }
};

export const action = async ({ request }) => {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const twilio = new Twilio.Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
    const formData = await request.formData();

    try {
        const parsedBody = Object.fromEntries(formData.entries());
        const callSid = parsedBody.CallSid;

        const { data: dbCall, error: callError } = await supabase
            .from('call')
            .select('campaign_id, outreach_attempt_id, workspace')
            .eq('sid', callSid)
            .single();
        if (callError) throw callError;

        const campaignPromise = getCampaignData(supabase, dbCall.campaign_id);
        const call = twilio.calls(callSid);

        const updateCallAndAttempt = async (answeredBy) => {
            const firstStepUrl = `${process.env.BASE_URL}/api/ivr/${dbCall.campaign_id}/1`;
            await call.update({ url: firstStepUrl });

            const updates = [
                supabase
                    .from('call')
                    .upsert({ sid: callSid, answered_by: answeredBy }, { onConflict: 'sid' })
                    .select(),
                supabase
                    .from('outreach_attempt')
                    .update({ answered_at: new Date() })
                    .eq('id', dbCall.outreach_attempt_id)
                    .select()
            ];

            const [callUpdate, attemptUpdate] = await Promise.all(updates);

            if (callUpdate.error) throw callUpdate.error;
            if (attemptUpdate.error) throw attemptUpdate.error;

            return { callUpdate, attemptUpdate };
        };

        const updateOperations = [];

        if (parsedBody.AnsweredBy && parsedBody.AnsweredBy.includes('machine') && !parsedBody.AnsweredBy.includes('other') && parsedBody.CallStatus !== 'completed') {
            const campaign = await campaignPromise;
            updateOperations.push(handleVoicemail(twilio, callSid, dbCall, campaign, supabase));
        } else if (parsedBody.AnsweredBy === 'human' || parsedBody.AnsweredBy === 'unknown') {
            updateOperations.push(updateCallAndAttempt(parsedBody.AnsweredBy));
        } else {
            updateOperations.push(updateCallAndAttempt(parsedBody.AnsweredBy));
        }

        await Promise.all(updateOperations);
    } catch (error) {
        console.error(error);
        return json({ success: false, error });
    }
    return json({ success: true });
};
