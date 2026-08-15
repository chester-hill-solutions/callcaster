import VoiceResponse from "twilio/lib/twiml/VoiceResponse.js";

/**
 * The single seam for Twilio Voice TwiML construction. This is the ONLY
 * module in the codebase that may import `twilio/lib/twiml/VoiceResponse.js`
 * (or reach `Twilio.twiml.VoiceResponse` off the main SDK) — enforced by
 * `scripts/check-handlers.mjs`. Using the real SDK class gets automatic XML
 * escaping for interpolated URLs / script text that hand-written string
 * literals never had.
 *
 * Two shapes are exported:
 *  - Single-verb helpers (`hangupTwiml`, `pauseTwiml`, ...) for the routes
 *    that only ever emit one fixed shape of response.
 *  - {@link createVoiceResponse}, a thin factory for routes that build a
 *    response conditionally across several verbs (dial/gather/enqueue with
 *    branching, nested Number/Client/Conference, etc). Callers get the same
 *    chainable builder the SDK always provided — they just obtain it from
 *    here instead of constructing `new Twilio.twiml.VoiceResponse()`
 *    themselves. Building on the SDK object internally is intentional; the
 *    point is that no other file ever imports it directly.
 */

/** The chainable TwiML builder returned by {@link createVoiceResponse}. Use
 * this type (not `Twilio.twiml.VoiceResponse`) when a helper needs to accept
 * or mutate a TwiML response passed in by a caller. */
export type TwimlResponse = InstanceType<typeof VoiceResponse>;

/** Construct a new, empty TwiML response for callers that need to build up
 * multiple / conditional verbs (dial, gather, enqueue, redirect, ...). */
export function createVoiceResponse(): TwimlResponse {
  return new VoiceResponse();
}

/** `<Response><Hangup/></Response>` */
export function hangupTwiml(): string {
  const twiml = createVoiceResponse();
  twiml.hangup();
  return twiml.toString();
}

/** `<Response><Pause length="{seconds}"/></Response>` */
export function pauseTwiml(seconds = 1): string {
  const twiml = createVoiceResponse();
  twiml.pause({ length: seconds });
  return twiml.toString();
}

/** `<Response><Pause length="1"/><Play>{url}</Play></Response>` */
export function pausePlayTwiml(url: string, pauseSeconds = 1): string {
  const twiml = createVoiceResponse();
  twiml.pause({ length: pauseSeconds });
  twiml.play(url);
  return twiml.toString();
}

/** `<Response><Pause length="1"/><Say>{text}</Say></Response>` */
export function pauseSayTwiml(text: string, pauseSeconds = 1): string {
  const twiml = createVoiceResponse();
  twiml.pause({ length: pauseSeconds });
  twiml.say(text);
  return twiml.toString();
}

/** `<Response><Play>{url}</Play></Response>` */
export function playTwiml(url: string): string {
  const twiml = createVoiceResponse();
  twiml.play(url);
  return twiml.toString();
}

/** `<Response><Say>{text}</Say><Hangup/></Response>` — the common
 * "can't handle this call" fallback shape used across the Twilio webhook
 * routes' unhandled-error paths. */
export function sayHangupTwiml(text: string): string {
  const twiml = createVoiceResponse();
  twiml.say(text);
  twiml.hangup();
  return twiml.toString();
}

/** `<Response><Redirect>{url}</Redirect></Response>` */
export function redirectTwiml(url: string): string {
  const twiml = createVoiceResponse();
  twiml.redirect(url);
  return twiml.toString();
}
