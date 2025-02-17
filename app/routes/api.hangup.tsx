import { json } from "@remix-run/node";
import { createWorkspaceTwilioInstance } from "../lib/database.server";
import { verifyAuth } from "~/lib/supabase.server";

export const action = async ({ request }: { request: Request }) => {
    const {supabaseClient:supabase, user} = await verifyAuth(request);
    const data = await request.json();
    try {
        const realtime = supabase.realtime.channel(data.conference_id)
        const twilio = await createWorkspaceTwilioInstance({supabase, workspace_id: data.workspaceId});
        await twilio.calls(data.callSid).update({ twiml: `<Response><Hangup/></Response>` });
        realtime.send({
            type: "broadcast", event: "message", payload: {
                contact_id: null,
                status: 'idle'
            }
        });
        const {data:queue, error:queueError} = await supabase.from("campaign_queue").select().eq("status", user.id).single()
        if (queueError) throw queueError;
        const { data:dequeue, error } = await supabase.rpc('dequeue_contact', { passed_contact_id: queue.contact_id, group_on_household: true });
        if (error) throw error;
        const {data:outreach, error:outreachError} = await supabase.from("outreach_attempt").update({disposition:"completed"}).eq("contact_id", queue.contact_id).eq("workspace", data.workspaceId)
        if (outreachError) throw outreachError;
        supabase.removeChannel(realtime);
        return json({ success: true });
   
    } catch (error) {
        console.error('Error hanging up call:', error);
        if (error instanceof Error && (error.message.includes('Call is not in-progress'))) {
            return json({ success: false, message: 'Call is already completed or not in progress' }, { status: 400 });
        } else {
            return json({ success: false, message: 'An error occurred while hanging up the call' }, { status: 500 });
        }
    }
};