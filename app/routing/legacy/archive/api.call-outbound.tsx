import { xml } from 'remix-utils/responses';
import twilio from 'twilio';
import type { ActionFunctionArgs } from "@remix-run/node";
import { logger } from "@/lib/logger.server";
import { env } from "@/lib/env.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const baseUrl = env.BASE_URL();

  const formData = await request.formData();
  const callSid = (formData.get('CallSid') as string).slice(1);
  const fromNumber = formData.get('From') as string;
  const toNumber = formData.get('To') as string;
  logger.debug(`Handling call from ${fromNumber} to ${toNumber}, CallSid: ${callSid}`);

  const response = new twilio.twiml.VoiceResponse();
  const connect = response.connect();
  connect.stream({
    name: `Call with ${toNumber}`,
    url: `wss://socketserver-production-2306.up.railway.app/${callSid}`
  });
  response.say('The stream has started.');
  return xml(response.toString())
}
