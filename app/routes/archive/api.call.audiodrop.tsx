import { json } from '@remix-run/node';
import Twilio from 'twilio';
import type { ActionFunctionArgs } from "@remix-run/node";

const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

interface AudiodropRequest {
  to: string;
}

export const action = async ({ request }: ActionFunctionArgs) => {
    const baseUrl = process.env.BASE_URL

    const client = new Twilio.Twilio(accountSid, authToken);
    const {to: toNumber}: AudiodropRequest = await request.json();
/* 
    if (!/^[+]?[\d\(\)\-\s]+$/.test(toNumber)) {
        return new Response("Invalid phone number.", { status: 400 });
    } */

    try {
        const call = await client.calls.create({
            to: toNumber,
            from: process.env.TWILIO_PHONE_NUMBER,
            url: `${baseUrl}/api/play-audio`,
            machineDetection:'DetectMessageEnd',
            statusCallback:'/api/audiodrop-status'
        });
        return json({ success: true, message: 'Robocall initiated', callSid: call.sid });
    } catch (error) {
        return json({ success: false, message: error.message }, { status: 500 });
    }
};
