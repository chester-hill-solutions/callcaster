import { xml } from 'remix-utils/responses';
import twilio from 'twilio';

export const action = async ({ request }) => {
  const baseUrl = process.env.BASE_URL

  const formData = await request.formData();
  const callSid = formData.get('CallSid').slice(1);
  const fromNumber = formData.get('From');
  const toNumber = formData.get('To');
  console.log(`Handling call from ${fromNumber} to ${toNumber}, CallSid: ${callSid}`);

  const response = new twilio.twiml.VoiceResponse();
  const connect = response.connect();
  connect.stream({
    name: `Call with ${toNumber}`,
    url: `wss://socketserver-production-2306.up.railway.app/${callSid}`
  });
  response.say('The stream has started.');
  return xml(response.toString())
}
