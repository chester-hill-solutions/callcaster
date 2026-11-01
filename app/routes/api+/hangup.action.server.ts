import {
  createWorkspaceTwilioInstance,
  requireWorkspaceAccess,
} from "@/lib/database/workspace.server";
import { parseActionRequest } from "@/lib/request-utils.server";
import { findCallBySid, updateOutreachAttemptForWorkspace } from "@/lib/telephony-db.server";
import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { requireJsonAuth } from "@/lib/api-auth.server";
import { dequeueLegacyVoiceAttempt } from "@/server/legacy-voice-queue.server";
import { createTenantDb } from "@/server/tenant-db";
import { hangupTwiml } from "@/lib/twilio-twiml.server";
import { defineAction } from "@/lib/handler.server";
import { findVoiceReservationForCall } from "@/server/voice-bridge-reservation.server";
import { dequeueFundedVoiceAttempt } from "@/server/voice-attempt-queue.server";
import { createOriginalVoiceAccountClient } from "@/lib/voice-original-account.server";

export const action = defineAction({
  auth: ({ request }) => requireJsonAuth(request),
  sideEffects: ["db-write", "twilio"],
  handler: async ({ request, auth }) => {
    const user = auth.user;
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
        const reservation = await findVoiceReservationForCall(workspaceId, callSid);
        const twilio = reservation ? await createOriginalVoiceAccountClient(reservation)
            : await createWorkspaceTwilioInstance({ workspace_id: workspaceId});
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
            // Household fan-out follows the campaign's setting; it was
            // hardcoded true, dequeuing whole households on campaigns that
            // never asked for household grouping.
            if (reservation) {
                await dequeueFundedVoiceAttempt(reservation);
            } else {
                await dequeueLegacyVoiceAttempt(workspaceId, callSid);
            }
            // Scope the disposition to THIS call's attempt. The old
            // updateOutreachDispositionByContactId rewrote every attempt for
            // the contact across all campaigns to "completed", destroying
            // do_not_call/voicemail history. The workspace-scoped update also
            // applies the terminal-transition guard, so a real disposition
            // already on the attempt is never downgraded.
            if (call.outreach_attempt_id) {
                await updateOutreachAttemptForWorkspace(
                    workspaceId,
                    call.outreach_attempt_id,
                    { disposition: "completed" },
                    { tdb },
                );
            }
        }
        return routeData({ success: true });

    } catch (error) {
        logger.error('Error hanging up call:', error);
        return routeData({ success: false, message: 'An error occurred while hanging up the call' }, { status: 500 });
    }
  },
});
