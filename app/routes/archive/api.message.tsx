import { data as routeData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import Twilio from 'twilio';

import { logger } from "@/lib/logger.server";
import { env } from "@/lib/env.server";

interface MessageRequest {
  to: string;
  messageBody: string;
}

function formatPhoneNumber(phoneNumber: string): string {
    const digitsOnly = phoneNumber.replace(/\D/g, '');
    let formattedNumber: string;
    if (digitsOnly.startsWith('1')) {
        formattedNumber = '+' + digitsOnly;
    } else {
        formattedNumber = '+1' + digitsOnly;
    }
    return formattedNumber;
}

const accountSid = env.TWILIO_SID();
const authToken = env.TWILIO_AUTH_TOKEN();
const baseUrl = env.BASE_URL();

export const action = async ({ request }: ActionFunctionArgs) => {
    const formData: MessageRequest = await request.data();
    const toNumber = formatPhoneNumber(formData.to);
    logger.debug("Message toNumber", toNumber);
    const body = formData.messageBody
    const fromNumber = env.TWILIO_PHONE_NUMBER();
    const twiml = new Twilio.Twilio(accountSid, authToken);
    try {
        const message = await twiml.messages.create({
            body,
            from: `${fromNumber}`,
            to: `${toNumber}`
        });
        return routeData({ success: true, message});
    } catch (error){
        logger.error("Error sending message:", error);
        return routeData({ success: false, message: error.message }, { status: 500 });
    }
}

export const loader = async ({request}: LoaderFunctionArgs) => {
    const url = new URL(request.url)
    const data = url.searchParams;
    logger.debug("Message loader data", data);
    return routeData({success: true, data})
}