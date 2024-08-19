import { createClient } from "@supabase/supabase-js";
import { json } from "@remix-run/node";
import { createWorkspaceTwilioInstance } from "../lib/database.server";

export const action = async ({ request }) => {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const data = await request.json();
    try {
        const twilio = await createWorkspaceTwilioInstance({supabase, workspace_id: data.workspaceId});
        await twilio.calls(data.callSid).update({ twiml: `<Response><Hangup/></Response>` });
        return json({ success: true });
    } catch (error) {
        console.error('Error hanging up call:', error);
        if (error.code === 20404 || error.message.includes('Call is not in-progress')) {
            return json({ success: false, message: 'Call is already completed or not in progress' }, { status: 400 });
        } else {
            return json({ success: false, message: 'An error occurred while hanging up the call' }, { status: 500 });
        }
    }
};