import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";
import { json } from "@remix-run/react";
import { createWorkspaceTwilioInstance } from "../lib/database.server";

export const action = async ({ request }) => {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    const formData = await request.formData();

    const parsedBody = {};

    for (const pair of formData.entries()) {
        parsedBody[pair[0]] = pair[1];
    }
    try {
        const { data: dbCall, error: callError } = await supabase.from('call').select('campaign_id, outreach_attempt_id, workspace').eq('sid', parsedBody.CallSid).single();
        if (callError) throw callError
        const twilio = await createWorkspaceTwilioInstance({supabase, workspace_id: dbCall.workspace});
        const { data: campaign, error: campaignError } = await supabase.from('campaign').select('voicemail_file').eq('id', dbCall.campaign_id).single();
        if (campaignError) throw campaignError
        const { data, error: voicemailError } = campaign.voicemail_file ? await supabase.storage.from(`workspaceAudio`).createSignedUrl(`${dbCall.workspace}/${campaign.voicemail_file}`, 3600) : {data:null, error:null}
        if (voicemailError) throw voicemailError
        const call = twilio.calls(parsedBody.CallSid);
        const answeredBy = formData.get('AnsweredBy');
        const callStatus = formData.get('CallStatus')
        if (answeredBy && answeredBy.includes('machine') && !answeredBy.includes('other') && callStatus !== 'completed') {
            try {
                if (data && data.signedUrl) {
                    const { data: outreachStatus, error: outreachError } = await supabase.from('outreach_attempt').update({ disposition: 'voicemail' }).eq('id', dbCall.outreach_attempt_id).select();
                    if (outreachError) throw outreachError
                    call.update({
                        twiml: `<Response><Pause length="5"/><Play>${data.signedUrl}</Play></Response>`
                    })
                    return json({ success: true });
                } else {
                    const { data: outreachStatus, error: outreachError } = await supabase.from('outreach_attempt').update({ disposition: 'no-answer' }).eq('id', dbCall.outreach_attempt_id).select();
                    if (outreachError) throw outreachError
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
