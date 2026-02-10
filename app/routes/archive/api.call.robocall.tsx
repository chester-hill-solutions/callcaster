import { json } from '@remix-run/node';
import Twilio from 'twilio';
import type { ActionFunctionArgs } from "@remix-run/node";
import { env } from "@/lib/env.server";

const accountSid = env.TWILIO_SID();
const authToken = env.TWILIO_AUTH_TOKEN();

interface RobocallRequest {
  to: string;
}

export const action = async ({ request }: ActionFunctionArgs) => {

    const baseUrl = env.BASE_URL();
    const client = new Twilio.Twilio(accountSid, authToken);
    const {to: toNumber}: RobocallRequest = await request.json();

    if (!/^[+]?[\d\(\)\-\s]+$/.test(toNumber)) {
        return new Response("Invalid phone number.", { status: 400 });
    }

    try {
        const call = await client.calls.create({
            to: toNumber,
            from: env.TWILIO_PHONE_NUMBER(),
            url: `${baseUrl}/api/handle-questions`
        });
        return json({ success: true, message: 'Robocall initiated', callSid: call.sid });
    } catch (error) {
        return json({ success: false, message: error.message }, { status: 500 });
    }
};
