import { createWorkspaceTwilioInstance, parseActionRequest, requireWorkspaceAccess } from "@/lib/database.server";
import { findCallBySid, updateOutreachDispositionByContactId } from "@/lib/telephony-db.server";
import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { requireJsonAuth } from "@/lib/api-auth.server";
import { rpcDequeueContact } from "@/lib/db-rpc.server";
import { createTenantDb } from "@/server/tenant-db";
import { hangupTwiml } from "@/lib/twilio-twiml.server";


export const action = async ({ request }: { request: Request }) => {

    const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;  const user = auth.user;
    const data = await parseActionRequest(request);
    const workspaceId =
        typeof data.workspaceId === "string" ? data.workspaceId : null;
    const callSid = typeof data.callSid === "string" ? data.callSid : null;
    if (!workspaceId || !callSid) {
        return routeData({ success: false, message: "Invalid hangup payload" }, { status: 400 });
    }
    try {
        await requireWorkspaceAccess({ user, workspaceId });

        const call = await findCallBySid(callSid);
        if (!call || call.workspace !== workspaceId) {
            return routeData({ success: false, message: "Call not found" }, { status: 404 });
        }

        const tdb = createTenantDb(workspaceId);
        const twilio = await createWorkspaceTwilioInstance({ workspace_id: workspaceId});
        try {
            await twilio.calls(callSid).update({ twiml: hangupTwiml() });
        } catch (twilioErr: unknown) {
            const code = (twilioErr as { code?: number })?.code;
            if (code === 21220) {
                // Call already ended (e.g. caller hung up); continue to optional dequeue
            } else {
                throw twilioErr;
            }
        }
        if (call.contact_id) {
            await rpcDequeueContact(tdb, {
                contactId: call.contact_id,
                groupOnHousehold: true,
                dequeuedById: user.id,
                dequeuedReasonText: "Call completed",
            });
            await updateOutreachDispositionByContactId(
                workspaceId,
                call.contact_id,
                "completed",
            );
        }
        return routeData({ success: true });
   
    } catch (error) {
        logger.error('Error hanging up call:', error);
        return routeData({ success: false, message: 'An error occurred while hanging up the call' }, { status: 500 });
    }
}
