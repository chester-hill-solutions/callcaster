import Twilio from "twilio";

/**
 * Typed TwiML builders for the inline `<Response>...</Response>` string sites.
 * Using {@link Twilio.twiml.VoiceResponse} gets automatic XML escaping for
 * interpolated URLs / script text — the inline strings had none.
 *
 * Routes that need to compose multiple verbs should keep building their own
 * `new Twilio.twiml.VoiceResponse()` (see `app/lib/inbound-voicemail-twiml.server.ts`).
 * These helpers are for the one-verb cases that were inline string literals.
 */

/** `<Response><Hangup/></Response>` */
export function hangupTwiml(): string {
  const twiml = new Twilio.twiml.VoiceResponse();
  twiml.hangup();
  return twiml.toString();
}

/** `<Response><Pause length="{seconds}"/></Response>` */
export function pauseTwiml(seconds = 1): string {
  const twiml = new Twilio.twiml.VoiceResponse();
  twiml.pause({ length: seconds });
  return twiml.toString();
}

/** `<Response><Pause length="1"/><Play>{url}</Play></Response>` */
export function pausePlayTwiml(url: string, pauseSeconds = 1): string {
  const twiml = new Twilio.twiml.VoiceResponse();
  twiml.pause({ length: pauseSeconds });
  twiml.play(url);
  return twiml.toString();
}

/** `<Response><Pause length="1"/><Say>{text}</Say></Response>` */
export function pauseSayTwiml(text: string, pauseSeconds = 1): string {
  const twiml = new Twilio.twiml.VoiceResponse();
  twiml.pause({ length: pauseSeconds });
  twiml.say(text);
  return twiml.toString();
}

/** `<Response><Play>{url}</Play></Response>` */
export function playTwiml(url: string): string {
  const twiml = new Twilio.twiml.VoiceResponse();
  twiml.play(url);
  return twiml.toString();
}
