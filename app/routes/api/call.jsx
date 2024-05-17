import Twilio from 'twilio';

export const action = async ({ request }) => {
  const formData = await request.formData();
  const toNumber = formData.get('To');
  const baseUrl = process.env.BASE_URL
  let twiml = new Twilio.twiml.VoiceResponse();

  if (isAValidPhoneNumber(toNumber)) {

    let dial = twiml.dial({
      callerId: process.env.TWILIO_PHONE_NUMBER,
      record: 'record-from-answer',
      recordingStatusCallback: `${baseUrl}/api/recording`, // todo: set up recording.
      recordingStatusCallbackEvent: 'completed',
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

function isAValidPhoneNumber(number) {
  return /^[\d\+\-\(\) ]+$/.test(number);
}
