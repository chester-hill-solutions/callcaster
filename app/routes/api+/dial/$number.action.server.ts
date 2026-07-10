import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { requireTwilioSignature } from "@/lib/twilio-webhook.server";
import Twilio from 'twilio';
import type { ActionFunctionArgs } from "react-router";

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

export const action = async ({ request, params }: ActionFunctionArgs) => {
    try {
        const formData = await request.clone().formData();
        const callSid = String(formData.get("CallSid") ?? "");
        const forbidden = await requireTwilioSignature(request, callSid ? { callSid } : {});
        if (forbidden) return forbidden;

        const twiml = new Twilio.twiml.VoiceResponse();
        const number = params.number;

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
}
