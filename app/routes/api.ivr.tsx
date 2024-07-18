import { createClient } from "@supabase/supabase-js";
import { createWorkspaceTwilioInstance } from "../lib/database.server";

export const action = async ({ request }) => {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    const formData = await request.formData();

    const to_number = formData.get('to_number');
    const campaign_id = formData.get('campaign_id');
    const workspace_id = formData.get('workspace_id');
    const contact_id = formData.get('contact_id');
    const caller_id = formData.get('caller_id');
    const queue_id = formData.get('queue_id');
    const user_id = formData.get('user_id');

    try {
        const twilio = await createWorkspaceTwilioInstance({ supabase, workspace_id });
        
        const outreachAttempt = await supabase.rpc('create_outreach_attempt', {
            con_id: contact_id,
            cam_id: campaign_id,
            wks_id: workspace_id,
            queue_id: queue_id,
            usr_id: user_id
        });

        if (outreachAttempt.error) throw outreachAttempt.error;

        const call = await twilio.calls.create({
            to: to_number,
            from: caller_id,
            url: `${process.env.BASE_URL}/api/ivr/${campaign_id}/page_1/`,
            machineDetection: 'Enable',
            statusCallbackEvent: ['answered', 'completed'],
            statusCallback: `${process.env.BASE_URL}/api/ivr/status`
        });

        await supabase.from('call').insert({
            sid: call.sid,
            to: to_number,
            from: caller_id,
            campaign_id,
            contact_id,
            workspace: workspace_id,
            outreach_attempt_id: outreachAttempt.data
        });

        return new Response(JSON.stringify({ success: true, callSid: call.sid }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error processing call:', error);
        return new Response(JSON.stringify({ error: 'There was an error processing your call.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};