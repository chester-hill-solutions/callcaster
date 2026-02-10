import Twilio from 'twilio';
import type { ActionFunctionArgs } from "@remix-run/node";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
    const twiml = new Twilio.twiml.VoiceResponse();
    const formData = await request.formData();
    const number = params.number;
    try {
        const dial = twiml.dial({
            callerId: formData.get('From') as string,
            record: 'record-from-answer',
            recordingStatusCallbackEvent: 'in-progress'
        })

        dial.number({
            machineDetection: 'Enable',
            amdStatusCallback: `${env.BASE_URL()}/api/dial/status`,
            statusCallback: '/api/call-status/',
            statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
        }, number!);
    } catch (e) {
        logger.error("Error in dial route:", e);
        throw (e)
    }
    return new Response(twiml.toString(), {
        headers: {
            'Content-Type': 'text/xml'
        }
    });
}
