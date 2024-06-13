import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";
import { json } from "@remix-run/react";

export const action = async ({ request }) => {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const twilio = new Twilio.Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
    const formData = await request.formData();

    const parsedBody = {};

    for (const pair of formData.entries()) {
        parsedBody[pair[0]] = pair[1];
    }
    try {
        const { data: dbCall, error: callError } = await supabase.from('call').select('campaign_id, outreach_attempt_id, workspace').eq('sid', parsedBody.CallSid).single();
        const { data: campaign, error: campaignError } = await supabase.from('campaign').select('voicemail_file').eq('id', dbCall.campaign_id).single();
        const { data: { signedUrl }, error: voicemailError } = await supabase.storage.from(`workspaceAudio`).createSignedUrl(`${dbCall.workspace}/${campaign.voicemail_file}`, 3600)
        const call = twilio.calls(parsedBody.CallSid);
        const answeredBy = formData.get('AnsweredBy');
        const callStatus = formData.get('CallStatus')
        if (answeredBy && answeredBy.includes('machine') && !answeredBy.includes('other') && callStatus !== 'completed') {
            try {
                if (signedUrl) {
                    const { data: outreachStatus, error: outreachError } = await supabase.from('outreach_attempt').update({ disposition: 'voicemail' }).eq('id', dbCall.outreach_attempt_id).select();
                    call.update({
                        twiml: `<Response><Pause length="5"/><Play>${signedUrl}</Play></Response>`
                    })
                    return json({ success: true });
                } else {
                    const { data: outreachStatus, error: outreachError } = await supabase.from('outreach_attempt').update({ disposition: 'no-answer' }).eq('id', dbCall.outreach_attempt_id).select();
                    call.update({
                        twiml: `<Response><Hangup/></Response>`
                    })
                    return json({ success: true });
                }
            }
            catch (error) {
                console.log(error)
            }
        } else {
            const { data, error } = await supabase.from('call').upsert({ sid: parsedBody.CallSid, answered_by: answeredBy }, { onConflict: 'sid' }).select();
            if (error) throw { callError: error }
            const { data: attempt, error: attemptError } = await supabase.from('outreach_attempt').update({ answered_at: new Date() }).eq('id', dbCall.outreach_attempt_id).select();
            if (attemptError) throw { attemptError };
            return json({ success: true, data, attempt });
        }
    } catch (error) {
        console.log(error)
        return json({ success: false, error })
    }

};