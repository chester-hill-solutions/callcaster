import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { appendLiveTranscriptionStreamTwiml } from "@/lib/media-stream-twiml.server";
import { findCallBySid } from "@/lib/telephony-db.server";
import {
    requireTwilioSignature,
    twilioWebhookForbiddenHangup,
} from "@/lib/twilio-webhook.server";
import { getWorkspaceById } from "@/lib/workspace-members-db.server";
import { defineAction } from "@/lib/handler.server";
import Twilio from 'twilio';

/** Fallback TwiML returned when the handler throws unexpectedly, so Twilio
 * hears a graceful message instead of an HTML error page. */
function dialUnavailableTwiml(): Response {
    const twiml = new Twilio.twiml.VoiceResponse();
    twiml.say("We're unable to take your call right now. Please try again later.");
    twiml.hangup();
    return new Response(twiml.toString(), {
        status: 200,
        headers: { "Content-Type": "text/xml" },
    });
}

export const action = defineAction({
    auth: async ({ request }) => {
        const formData = await request.clone().formData();
        const callSid = String(formData.get("CallSid") ?? "");
        // Twilio always supplies CallSid when fetching a call's TwiML action
        // URL. Omitting the option here (rather than requiring it) would
        // silently downgrade validation to the main-account token instead of
        // this call's workspace token — fail closed instead.
        if (!callSid) return twilioWebhookForbiddenHangup();
        const forbidden = await requireTwilioSignature(request, { callSid });
        return forbidden ?? null;
    },
    sideEffects: ["twilio"],
    handler: async ({ request, params }) => {
        try {
            const formData = await request.clone().formData();
            const twiml = new Twilio.twiml.VoiceResponse();
            const number = params.number;
            const callSid = String(formData.get("CallSid") ?? "");

            if (callSid) {
                const call = await findCallBySid(callSid);
                const workspaceId = call?.workspace;
                if (call && workspaceId && call.user_id) {
                    const workspace = await getWorkspaceById(workspaceId);
                    appendLiveTranscriptionStreamTwiml({
                        twiml,
                        featureFlags: workspace?.feature_flags as Record<string, unknown> | undefined,
                        params: {
                            workspaceId,
                            userId: call.user_id,
                            direction: "outbound",
                            contactId: call.contact_id,
                            campaignId: call.campaign_id,
                            callSid,
                            streamName: `call-${callSid}`,
                        },
                    });
                }
            }

            const dial = twiml.dial({
                callerId: formData.get('From') as string,
                record: 'record-from-answer',
                recordingStatusCallbackEvent: ['in-progress']
            })

            dial.number({
                machineDetection: 'Enable',
                amdStatusCallback: `${env.BASE_URL()}/api/dial/status`,
                statusCallback: `${env.BASE_URL()}/api/call-status/`,
                statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
            }, number!);

            return new Response(twiml.toString(), {
                headers: {
                    'Content-Type': 'text/xml'
                }
            });
        } catch (e) {
            logger.error("Error in dial route:", e);
            return dialUnavailableTwiml();
        }
    },
});
