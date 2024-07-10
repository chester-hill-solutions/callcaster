import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";
import { json } from "@remix-run/react";
import { createWorkspaceTwilioInstance } from "../lib/database.server";

export const action = async ({ request }) => {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const data = await request.json()
    const twilio = await createWorkspaceTwilioInstance({supabase, workspace_id: data.workspaceId});

    twilio.calls(data.callSid).update({ twiml: `<Response><Hangup/></Response>` })
        .catch(e => (console.error(e)));
    
    return json({ success: true });

};