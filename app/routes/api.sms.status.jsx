import { json } from "@remix-run/react";
import { createClient } from "@supabase/supabase-js";
//import Twilio from 'twilio';

export const action = async ({ request }) => {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    //const twilio = new Twilio.Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
    const formData = await request.formData();

    const parsedBody = Object.fromEntries(formData.entries());
    const { SmsSid: sid, SmsStatus: status } = parsedBody;
    const { data: record, error } = await supabase.from('message').update({status}).eq('sid', sid)
    if (error) console.log(error)
    return json(record)
}
