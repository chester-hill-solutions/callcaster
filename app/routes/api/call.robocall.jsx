import { json } from '@remix-run/node';
import Twilio from 'twilio';

const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;


export const action = async ({ request }) => {

    const baseUrl = process.env.BASE_URL
    const client = new Twilio.Twilio(accountSid, authToken);
    const {to: toNumber} = await request.json();

    if (!/^[+]?[\d\(\)\-\s]+$/.test(toNumber)) {
        return new Response("Invalid phone number.", { status: 400 });
    }

    try {
        const call = await client.calls.create({
            to: toNumber,
            from: process.env.TWILIO_PHONE_NUMBER,
            url: `${baseUrl}/api/handle-questions`
        });
        return json({ success: true, message: 'Robocall initiated', callSid: call.sid });
    } catch (error) {
        return json({ success: false, message: error.message }, { status: 500 });
    }
};
