import Twilio from "twilio";
import { json } from "@remix-run/react";
import { getSupabaseServerClientWithSession } from "../lib/supabase.server";
export const action = async ({ request }) => {
    const { supabaseClient, headers, serverSession } = await getSupabaseServerClientWithSession(request);
    const twilio = new Twilio.Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
    const conferences = await twilio.conferences.list({ friendlyName: serverSession.user.id, status: ['in-progress'] });
    try {
        conferences.map((conf) => {
            twilio.conferences(conf.sid).update({ status: 'completed' })
            const { data, error } = supabaseClient.from('call').select('sid').eq('conference_id', conf.sid);
            if (error) console.error(error)
            data.map((call) => {
                twilio.calls(call.sid).update({ twiml: `<Response><Hangup/></Response>` })
            })
        })
    }
    catch (e) {
        console.log(e);
        return json({ error: e })
    }
    return json({ success: true });

};