import { json } from "@remix-run/node";
import { createWorkspaceTwilioInstance, parseActionRequest, requireWorkspaceAccess } from "../../lib/database.server";
import { verifyAuth } from "@/lib/supabase.server";
import { logger } from "@/lib/logger.server";
import { isAssignedToUser } from "@/lib/queue-status";

export const action = async ({ request }: { request: Request }) => {
    const {supabaseClient:supabase, user} = await verifyAuth(request);
    const data = await parseActionRequest(request);
    const conferenceId =
        typeof data.conference_id === "string" ? data.conference_id : null;
    const workspaceId =
        typeof data.workspaceId === "string" ? data.workspaceId : null;
    const callSid = typeof data.callSid === "string" ? data.callSid : null;
    if (!workspaceId || !callSid) {
        return json({ success: false, message: "Invalid hangup payload" }, { status: 400 });
    }
    try {
        await requireWorkspaceAccess({ supabaseClient: supabase, user, workspaceId });

        let resolvedConferenceId = conferenceId;
        if (!resolvedConferenceId) {
            const { data: callRecord, error: callError } = await supabase
                .from("call")
                .select("conference_id")
                .eq("sid", callSid)
                .eq("workspace", workspaceId)
                .maybeSingle();
            if (callError) throw callError;
            resolvedConferenceId = callRecord?.conference_id ?? null;
        }

        const realtime = resolvedConferenceId
            ? supabase.realtime.channel(resolvedConferenceId)
            : null;
        const twilio = await createWorkspaceTwilioInstance({supabase, workspace_id: workspaceId});
        try {
            await twilio.calls(callSid).update({ twiml: `<Response><Hangup/></Response>` });
        } catch (twilioErr: unknown) {
            const code = (twilioErr as { code?: number })?.code;
            if (code === 21220) {
                // Call already ended (e.g. caller hung up); continue to broadcast + optional dequeue
            } else {
                throw twilioErr;
            }
        }
        realtime?.send({
            type: "broadcast", event: "message", payload: {
                contact_id: null,
                status: 'idle'
            }
        });
        const { data: queueRows, error: queueError } = await supabase
            .from("campaign_queue")
            .select("*, campaign(group_household_queue)")
            .is("dequeued_at", null);
        if (queueError) throw queueError;
        const queue = queueRows?.find((row) => isAssignedToUser(row, user.id));
        if (queue) {
            const { error } = await supabase.rpc('dequeue_contact', {
                passed_contact_id: queue.contact_id,
                group_on_household: queue.campaign.group_household_queue,
                dequeued_by_id: user.id,
                dequeued_reason_text: "Call completed"
            });
            if (error) throw error;
            const { error: outreachError } = await supabase
                .from("outreach_attempt")
                .update({ disposition: "completed" })
                .eq("contact_id", queue.contact_id)
                .eq("workspace", workspaceId);
            if (outreachError) throw outreachError;
        }
        if (realtime) {
            supabase.removeChannel(realtime);
        }
        return json({ success: true });
   
    } catch (error) {
        logger.error('Error hanging up call:', error);
        return json({ success: false, message: 'An error occurred while hanging up the call' }, { status: 500 });
    }
};