import { findActiveAssignedQueueForUser } from "@/lib/campaign-queue-db.server";
import { createWorkspaceTwilioInstance, parseActionRequest, requireWorkspaceAccess } from "@/lib/database.server";
import {
  findCallConferenceIdForWorkspace,
  updateOutreachDispositionByContactId,
} from "@/lib/telephony-db.server";
import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { getAuthSupabaseClient, requireJsonAuth } from "@/lib/api-auth.server";
import { hangupTwiml } from "@/lib/twilio-twiml.server";


export const action = async ({ request }: { request: Request }) => {

    const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;
  const supabase = getAuthSupabaseClient(auth);
  const user = auth.user;
    const data = await parseActionRequest(request);
    const conferenceId =
        typeof data.conference_id === "string" ? data.conference_id : null;
    const workspaceId =
        typeof data.workspaceId === "string" ? data.workspaceId : null;
    const callSid = typeof data.callSid === "string" ? data.callSid : null;
    if (!workspaceId || !callSid) {
        return routeData({ success: false, message: "Invalid hangup payload" }, { status: 400 });
    }
    try {
        await requireWorkspaceAccess({ user, workspaceId });

        let resolvedConferenceId = conferenceId;
        if (!resolvedConferenceId) {
          resolvedConferenceId =
            (await findCallConferenceIdForWorkspace(workspaceId, callSid)) ?? null;
        }

        const realtime = resolvedConferenceId
            ? supabase.realtime.channel(resolvedConferenceId)
            : null;
        const twilio = await createWorkspaceTwilioInstance({ supabase: supabase, workspace_id: workspaceId});
        try {
            await twilio.calls(callSid).update({ twiml: hangupTwiml() });
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
        const queue = await findActiveAssignedQueueForUser(user.id);
        if (queue) {
            const { error } = await supabase.rpc('dequeue_contact', {
                passed_contact_id: queue.contact_id,
                group_on_household: queue.group_household_queue,
                dequeued_by_id: user.id,
                dequeued_reason_text: "Call completed"
            });
            if (error) throw error;
            await updateOutreachDispositionByContactId(
                workspaceId,
                queue.contact_id,
                "completed",
            );
        }
        if (realtime) {
            supabase.removeChannel(realtime);
        }
        return routeData({ success: true });
   
    } catch (error) {
        logger.error('Error hanging up call:', error);
        return routeData({ success: false, message: 'An error occurred while hanging up the call' }, { status: 500 });
    }
}
