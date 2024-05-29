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
    };

    console.log(parsedBody)
    const { data: dbCall, error: callError } = await supabase.from('call').select('campaign_id').eq('sid', parsedBody.CallSid);
    const { data: campaign, error: campaignError } = await supabase.from('campaign').select('voicemail_file').eq('id', dbCall[0].campaign_id).single();

    const call = twilio.calls(parsedBody.CallSid);
    const answeredBy = formData.get('AnsweredBy');
    if (answeredBy && answeredBy.includes('machine') && !answeredBy.includes('other')) {
        try { call.update({ twiml: `<Response><Pause length="5"/><Play>${campaign.voicemail_file}</Play></Response>` }) }
        catch (error){
            console.log(error)
        }
    }


    const { data, error } = await supabase.from('call').upsert({ sid: call.sid, answered_by: answeredBy }, { onConflict: 'sid' }).select();
    return json({ success: true, data });

};
