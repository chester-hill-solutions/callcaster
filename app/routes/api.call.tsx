import Twilio from 'twilio';
import type { ActionFunctionArgs } from "@remix-run/node";

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const toNumber = formData.get('To') as string;
  const baseUrl = process.env.BASE_URL;
  let twiml = new Twilio.twiml.VoiceResponse();

  if (isAValidPhoneNumber(toNumber)) {
    let dial = twiml.dial({
      callerId: process.env.TWILIO_PHONE_NUMBER,
      record: 'record-from-answer',
      recordingStatusCallback: `${baseUrl}/api/recording`,
      recordingStatusCallbackEvent: 'completed',
      transcribe: true,
      transcribeCallback: `${baseUrl}/api/transcribe`
    });
    dial.number(toNumber);
  } else {
    twiml.say('The provided phone number is invalid.');
  }

  return new Response(twiml.toString(), {
    headers: {
      'Content-Type': 'text/xml'
    }
  });
};

function isAValidPhoneNumber(number: string): boolean {
  return /^[\d\+\-\(\) ]+$/.test(number);
}
