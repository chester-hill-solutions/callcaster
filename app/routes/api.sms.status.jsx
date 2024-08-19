import { json } from "@remix-run/react";
import { createClient } from "@supabase/supabase-js";
//import Twilio from 'twilio';

export const action = async ({ request }) => {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    //const twilio = new Twilio.Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
    const formData = await request.formData();

    const parsedBody = Object.fromEntries(formData.entries());
    const { SmsSid: sid, SmsStatus: status } = parsedBody;
    const { data: record, error } = await supabase.from('message').update({status}).eq('sid', sid).select();
    if (error) console.log(error)
    const { data: outreach, error:outreachError } = record?.[0]?.outreach_attempt_id ? await supabase.from('outreach_attempt').update({disposition: status}).eq('id', record[0].outreach_attempt_id).select() : {data: null, error: null};
    if (outreachError) console.log(outreachError)
    return json({record, outreach})
}
