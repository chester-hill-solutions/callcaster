import { json } from "@remix-run/react";
import { getSupabaseServerClientWithSession } from "../lib/supabase.server";
import { createWorkspaceTwilioInstance } from "../lib/database.server";

export const action = async ({ request }) => {
    const { supabaseClient, headers, serverSession } = await getSupabaseServerClientWithSession(request);
    const { workspaceId: workspace_id } = await request.json();
    const twilio = await createWorkspaceTwilioInstance({ supabase: supabaseClient, workspace_id });

    try {
        const conferences = await twilio.conferences.list({ friendlyName: serverSession.user.id, status: ['in-progress'] });

        await Promise.all(conferences.map(async (conf) => {
            try {
                await twilio.conferences(conf.sid).update({ status: 'completed' });

                const { data, error } = await supabaseClient.from('call').select('sid').eq('conference_id', conf.sid);
                if (error) throw error;

                await Promise.all(data.map(async (call) => {
                    try {
                        await twilio.calls(call.sid).update({ twiml: `<Response><Hangup/></Response>` });
                    } catch (callError) {
                        console.error(`Error updating call ${call.sid}:`, callError);
                    }
                }));
            } catch (confError) {
                console.error(`Error updating conference ${conf.sid}:`, confError);
            }
        }));
    } catch (e) {
        console.error('Error listing or updating conferences:', e);
        return json({ error: e.message }, { status: 500 });
    }

    return json({ success: true });
};
