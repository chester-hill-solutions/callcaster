import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";
import { json } from "@remix-run/react";

export const action = async ({ request }) => {

    const twilio = new Twilio.Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
    const data = await request.json()

    try { twilio.calls(data.parameters.CallSid).update({ twiml: `<Response><Hangup/></Response>` }); }
    catch (e) {
        console.log(e);
        return json({ error: e })
    }
    return json({ success: true });

};