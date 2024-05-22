import Twilio from 'twilio';
import { json } from '@remix-run/node';

function formatPhoneNumber(phoneNumber) {
    const digitsOnly = phoneNumber.replace(/\D/g, '');
    let formattedNumber;
    if (digitsOnly.startsWith('1')) {
        formattedNumber = '+' + digitsOnly;
    } else {
        formattedNumber = '+1' + digitsOnly;
    }
    return formattedNumber;
}
const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const baseUrl = process.env.BASE_URL

export const action = async ({ request }) => {
    const formData = await request.json();
    const toNumber = formatPhoneNumber(formData.to);
    console.log(toNumber)
    const body = formData.messageBody
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    const twiml = new Twilio.Twilio(accountSid, authToken);
    try {
        const message = await twiml.messages.create({
            body,
            from: `${fromNumber}`,
            to: `${toNumber}`
        });
        return json({ success: true, message});
    } catch (error){
        console.log(error)
        return json({ success: false, message: error.message }, { status: 500 });
    }
}
export const loader = async ({request}) => {
    const url = new URL(request.url)
    const data = url.searchParams;
    console.log(data)
    return json({success: true, data})
}